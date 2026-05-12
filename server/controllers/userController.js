import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";
import createJWT from "../utils/index.js";
import Notice from "../models/notis.js";
import { isEmailConfigured, sendEmail } from "../services/emailService.js";
import { canAssignToTargetRank, getRoleRank } from "../utils/roleHierarchy.js";

const isEmailLike = (value = "") => {
  const v = String(value).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
};

const normalizeRole = (r) => (r ? String(r).trim() : "");
const normalizeDept = (d) => (d ? String(d).trim().toUpperCase() : "");
const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const deptCaseInsensitiveMatch = (dept = "") => ({
  $regex: `^${escapeRegex(String(dept).trim())}$`,
  $options: "i",
});
const canApproveTarget = ({ approver, target }) => {
  const approverRole = normalizeRole(approver?.role);
  const targetRole = normalizeRole(target?.role);
  const approverDept = normalizeDept(approver?.department);
  const targetDept = normalizeDept(target?.department);

  // Approval sequence:
  // - Principal/HOD requests -> Admin
  // - Faculty requests -> HOD of the same department
  // - Student requests -> Faculty of the same department
  if (approver?.isAdmin || approverRole === "Admin") {
    return targetRole === "Principal" || targetRole === "HOD";
  }

  if (approverRole === "Principal") {
    return false;
  }

  if (approverRole === "HOD") {
    if (!approverDept || !targetDept) return false;
    if (approverDept !== targetDept) return false;
    return targetRole === "Faculty";
  }

  if (approverRole === "Faculty") {
    if (!approverDept || !targetDept) return false;
    if (approverDept !== targetDept) return false;
    return targetRole === "Student";
  }

  return false;
};

const getVisiblePendingQuery = (approver) => {
  const approverRole = normalizeRole(approver?.role);
  const approverDept = normalizeDept(approver?.department);

  if (approver?.isAdmin || approverRole === "Admin") {
    return { status: "pending", role: { $in: ["Principal", "HOD"] }, isActive: true };
  }

  if (approverRole === "Principal") {
    return { status: "pending", _id: null };
  }

  if (approverRole === "HOD") {
    if (!approverDept) {
      // Misconfigured HOD (no department) - show nothing.
      return { status: "pending", _id: null };
    }
    return {
      status: "pending",
      role: "Faculty",
      department: deptCaseInsensitiveMatch(approverDept),
      isActive: true,
    };
  }

  if (approverRole === "Faculty") {
    if (!approverDept) {
      return { status: "pending", _id: null };
    }
    return {
      status: "pending",
      role: "Student",
      department: deptCaseInsensitiveMatch(approverDept),
      isActive: true,
    };
  }

  return { status: "pending", _id: null };
};

// POST request - login user
const loginUser = asyncHandler(async (req, res) => {
  const { email, identifier, password, role, department } = req.body;
  const idValue = (identifier || email || "").trim();

  const query = isEmailLike(idValue)
    ? { email: idValue.toLowerCase() }
    : { prn: idValue };

  const user = await User.findOne(query);

  if (!user) {
    return res
      .status(401)
      .json({ status: false, message: "Invalid email or password." });
  }

  if (!user?.isActive) {
    return res.status(401).json({
      status: false,
      message: "User account has been deactivated, contact the administrator",
    });
  }

  // Backward compatibility for older records without status.
  if (user?.status == null) {
    user.status = "approved";
    await user.save();
  }

  if (user?.status !== "approved") {
    if (user?.status === "pending") {
      return res
        .status(403)
        .json({ status: false, message: "Your account is not approved yet" });
    }
    return res
      .status(403)
      .json({ status: false, message: "Your account was not approved" });
  }

  const desiredRole = normalizeRole(role);
  if (desiredRole && normalizeRole(user.role) !== desiredRole) {
    return res.status(401).json({
      status: false,
      message: "Selected role does not match this account.",
    });
  }

  const desiredDept = normalizeDept(department);
  if (desiredDept && normalizeDept(user.department) !== desiredDept) {
    return res.status(401).json({
      status: false,
      message: "Selected department does not match this account.",
    });
  }

  const isMatch = await user.matchPassword(password);

  if (user && isMatch) {
    createJWT(res, user._id);

    user.password = undefined;

    res.status(200).json({
      user: {
        _id: user._id,
        name: user.name,
        isAdmin: user.isAdmin,
        email: user.email,
        prn: user.prn,
        role: user.role,
        title: user.title,
        department: user.department,
        year: user.year,
        section: user.section,
        rollNo: user.rollNo,
        facultyRole: user.facultyRole,
        status: user.status,
        approvedBy: user.approvedBy,
        isActive: user.isActive,
      }
    });
  } else {
    return res
      .status(401)
      .json({ status: false, message: "Invalid email or password" });
  }
});

// POST - Register a new user
const registerUser = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    role,
    department,
    year,
    section,
    rollNo,
    prn,
    facultyRole,
    subjectsSkills,
    secretKey,
  } = req.body;

  const requestedRole = normalizeRole(role);
  const requestedDept = normalizeDept(department);

  if (!requestedRole) {
    return res.status(400).json({ status: false, message: "Role is required." });
  }

  if (requestedRole === "Admin") {
    if (!process.env.ADMIN_SECRET_KEY) {
      return res.status(500).json({
        status: false,
        message: "ADMIN_SECRET_KEY is not configured on server.",
      });
    }
    if (!secretKey || String(secretKey) !== String(process.env.ADMIN_SECRET_KEY)) {
      return res.status(401).json({ status: false, message: "Invalid secret key." });
    }
  }

  const emailValue = email ? String(email).trim().toLowerCase() : "";
  const prnValue = prn ? String(prn).trim() : "";

  if (requestedRole !== "Student" && !emailValue) {
    return res.status(400).json({ status: false, message: "Email is required." });
  }

  if (requestedRole === "Student" && !prnValue) {
    return res.status(400).json({ status: false, message: "PRN is required." });
  }

  if (!["Principal", "Admin"].includes(requestedRole) && !requestedDept) {
    return res
      .status(400)
      .json({ status: false, message: "Department is required." });
  }

  if (emailValue) {
    const userExists = await User.findOne({ email: emailValue });
    if (userExists) {
      return res
        .status(400)
        .json({ status: false, message: "Email address already exists" });
    }
  }

  if (prnValue) {
    const prnExists = await User.findOne({ prn: prnValue });
    if (prnExists) {
      return res.status(400).json({ status: false, message: "PRN already exists" });
    }
  }

  const isAdmin = requestedRole === "Admin";
  const status = isAdmin ? "approved" : "pending";

  const user = await User.create({
    name,
    email: emailValue || undefined,
    prn: prnValue || undefined,
    password,
    isAdmin,
    role: requestedRole,
    title: requestedRole,
    department: requestedDept,
    year: year ? String(year).trim() : "",
    section: section ? String(section).trim() : "",
    rollNo: rollNo ? String(rollNo).trim() : "",
    facultyRole: facultyRole ? String(facultyRole).trim() : "",
    subjectsSkills: Array.isArray(subjectsSkills)
      ? subjectsSkills.map((s) => String(s).trim()).filter(Boolean)
      : typeof subjectsSkills === "string"
        ? subjectsSkills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
        : [],
    status,
    approvedBy: isAdmin ? null : null,
    approvedAt: isAdmin ? new Date() : null,
  });

  if (!user) {
    return res.status(400).json({ status: false, message: "Invalid user data" });
  }

  if (status === "pending") {
    let approvers = [];
    if (requestedRole === "Faculty") {
      approvers = await User.find({
        role: "HOD",
        department: deptCaseInsensitiveMatch(requestedDept),
        isActive: true,
        status: "approved",
      });
    } else if (requestedRole === "Student") {
      approvers = await User.find({
        role: "Faculty",
        department: deptCaseInsensitiveMatch(requestedDept),
        isActive: true,
        status: "approved",
      });
    } else if (requestedRole === "HOD" || requestedRole === "Principal") {
      approvers = await User.find({
        $or: [{ role: "Admin" }, { isAdmin: true }],
        isActive: true,
        status: "approved",
      });
    }

    if (approvers.length > 0) {
      const team = approvers.map((a) => a._id);
      const identifier = emailValue || prnValue || "User";
      const text = `New ${requestedRole} registration requires your approval: ${name} (${identifier})`;
      
      await Notice.create({
        team,
        text,
        notiType: "alert",
      });
    }
  }

  // Only auto-login admins; everyone else must wait for approval.
  if (isAdmin) {
    createJWT(res, user._id);
  }

  user.password = undefined;

  const shouldEmail = Boolean(user.email) && isEmailConfigured();
  if (shouldEmail) {
    const subject = "Registration received";
    const text =
      status === "approved"
        ? "Your account has been created and approved. You can now login."
        : "Your request is submitted and pending approval.";
    try {
      await sendEmail({ to: user.email, subject, text });
    } catch (e) {
      // Don't block registration if email fails.
      console.error("[email] registration email failed", e?.message || e);
    }
  }

  return res.status(201).json({
    status: true,
    message:
      status === "approved"
        ? "Account created and approved."
        : "Your request is submitted and pending approval.",
    user: {
      _id: user._id,
      name: user.name,
      isAdmin: user.isAdmin,
      email: user.email,
      prn: user.prn,
      role: user.role,
      title: user.title,
      department: user.department,
      year: user.year,
      section: user.section,
      rollNo: user.rollNo,
      facultyRole: user.facultyRole,
      status: user.status,
      approvedBy: user.approvedBy,
      isActive: user.isActive,
    },
  });
});

// POST -  Logout user / clear cookie
const logoutUser = (req, res) => {
  res.cookie("token", "", {
    httpOnly: true,
    expires: new Date(0),
  });
  res.status(200).json({ message: "Logged out successfully" });
};

// @GET -   Get user profile
// const getUserProfile = asyncHandler(async (req, res) => {
//   const { userId } = req.user;

//   const user = await User.findById(userId);

//   user.password = undefined;

//   if (user) {
//     res.json({ ...user });
//   } else {
//     res.status(404);
//     throw new Error("User not found");
//   }
// });

/**
 * Members / team list — role + department visibility:
 * - Principal: all departments (optional filters)
 * - HOD: same department, Faculty + Students only
 * - Faculty: same department, Students only
 * - Student (non-chat): only self
 * - scope=chat: all approved users (for chat invites)
 */
const getTeamList = asyncHandler(async (req, res) => {
  const { search, scope, department, year, section, role, excludeRole } = req.query;
  const forChat = scope === "chat";
  const requestedRole = normalizeRole(role);
  const excludedRole = normalizeRole(excludeRole);

  const applyRoleExclusion = (queryObj, excluded) => {
    if (!excluded) return queryObj;

    const out = { ...queryObj };
    const cond = out.role;

    // If caller requested an explicit role, honor it.
    if (cond && typeof cond === "string") {
      return out;
    }

    if (!cond) {
      out.role = { $ne: excluded };
      return out;
    }

    if (typeof cond === "object" && cond !== null) {
      if (Array.isArray(cond.$in)) {
        const next = cond.$in.filter((r) => normalizeRole(r) !== excluded);
        if (next.length === 0) {
          out.role = "__NO_MATCH__";
        } else {
          out.role = { ...cond, $in: next };
        }
      } else if (typeof cond.$regex === "string") {
        // Leave regex-based role searches unchanged.
      } else if (typeof cond.$ne === "string") {
        // Already excluded something; keep it.
      } else {
        out.role = { ...cond, $ne: excluded };
      }
      return out;
    }

    out.role = { $ne: excluded };
    return out;
  };

  const requester = await User.findById(req.user.userId).select(
    "name title role email prn department year section isAdmin status"
  );
  if (!requester) {
    return res.status(200).json([]);
  }

  const requesterRole = normalizeRole(requester.role);
  const requesterDept = normalizeDept(requester.department);

  if (!forChat && requesterRole === "Student") {
    return res.status(200).json([]);
  }

  const baseQuery = {
    status: "approved",
    isActive: true,
  };
  let visibilityQuery = {};

  if (forChat) {
    // Everyone approved — chat room invites
  } else if (requester.isAdmin || requesterRole === "Principal") {
    // All members; optional department/year/section filters from UI
    if (department) visibilityQuery.department = deptCaseInsensitiveMatch(normalizeDept(department));
    if (year) visibilityQuery.year = String(year).trim();
    if (section) visibilityQuery.section = String(section).trim();
  } else if (requesterRole === "HOD") {
    if (!requesterDept) {
      return res.status(200).json([]);
    }
    if (requestedRole === "Student") {
      visibilityQuery = {
        department: deptCaseInsensitiveMatch(requesterDept),
        role: "Student",
        ...(year ? { year: String(year).trim() } : {}),
        ...(section ? { section: String(section).trim() } : {}),
      };
    } else {
    visibilityQuery = {
      $or: [
        { role: { $in: ["Admin", "Principal"] } },
        {
          department: deptCaseInsensitiveMatch(requesterDept),
          role: { $in: ["HOD", "Faculty", "Student"] },
          ...(year ? { year: String(year).trim() } : {}),
          ...(section ? { section: String(section).trim() } : {}),
        },
      ],
    };
    }
  } else if (requesterRole === "Faculty") {
    if (!requesterDept) {
      return res.status(200).json([]);
    }
    if (requestedRole === "Student") {
      visibilityQuery = {
        department: deptCaseInsensitiveMatch(requesterDept),
        role: "Student",
        ...(year ? { year: String(year).trim() } : {}),
        ...(section ? { section: String(section).trim() } : {}),
      };
    } else {
      visibilityQuery = {
        $or: [
          { role: { $in: ["Admin", "Principal"] } },
          {
            department: deptCaseInsensitiveMatch(requesterDept),
            role: { $in: ["HOD", "Faculty", "Student"] },
            ...(year ? { year: String(year).trim() } : {}),
            ...(section ? { section: String(section).trim() } : {}),
          },
        ],
      };
    }
  } else {
    return res.status(200).json([]);
  }

  let query = { ...baseQuery, ...visibilityQuery };
  if (requestedRole) {
    query.role = requestedRole;
  }

  // Team page should not include Students; enforce via query param.
  // (Students page explicitly requests role=Student.)
  if (!requestedRole && excludedRole && !forChat) {
    query = applyRoleExclusion(query, excludedRole);
    if (query.role === "__NO_MATCH__") {
      return res.status(200).json([]);
    }
  }

  if (search) {
    const s = String(search).trim();
    const searchQuery = {
      $or: [
        { title: { $regex: s, $options: "i" } },
        { name: { $regex: s, $options: "i" } },
        { role: { $regex: s, $options: "i" } },
        { email: { $regex: s, $options: "i" } },
        { prn: { $regex: s, $options: "i" } },
      ],
    };
    query = { ...query, ...searchQuery };
  }

  const users = await User.find(query)
    .select(
      "name title role email prn department year section rollNo facultyRole isActive"
    )
    .sort({ name: 1 });

  res.status(200).json(users);
});

// @GET  - get user notifications
const getNotificationsList = asyncHandler(async (req, res) => {
  const { userId } = req.user;

  const notice = await Notice.find({
    team: userId,
    isRead: { $nin: [userId] },
  })
    .populate("task", "title")
    .sort({ _id: -1 });

  res.status(201).json(notice);
});

// @GET  - get user notifications
const markNotificationRead = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.user;
    const { isReadType, id } = req.query;

    if (isReadType === "all") {
      await Notice.updateMany(
        { team: userId, isRead: { $nin: [userId] } },
        { $push: { isRead: userId } },
        { new: true }
      );
    } else {
      await Notice.findOneAndUpdate(
        { _id: id, isRead: { $nin: [userId] } },
        { $push: { isRead: userId } },
        { new: true }
      );
    }
    res.status(201).json({ status: true, message: "Done" });
  } catch (error) {
    console.log(error);
  }
});

// PUT - Update user profile
const updateUserProfile = asyncHandler(async (req, res) => {
  const { userId, isAdmin } = req.user;
  const { _id } = req.body;

  const id =
    isAdmin && userId === _id
      ? userId
      : isAdmin && userId !== _id
        ? _id
        : userId;

  const user = await User.findById(id);

  if (user) {
    user.name = req.body.name || user.name;
    // user.email = req.body.email || user.email;
    user.title = req.body.title || user.title;
    user.role = req.body.role || user.role;

    const updatedUser = await user.save();

    user.password = undefined;

    res.status(201).json({
      status: true,
      message: "Profile Updated Successfully.",
      user: updatedUser,
    });
  } else {
    res.status(404).json({ status: false, message: "User not found" });
  }
});

// PUT - active/disactivate user profile
const activateUserProfile = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);

  if (user) {
    user.isActive = req.body.isActive;

    await user.save();

    user.password = undefined;

    res.status(201).json({
      status: true,
      message: `User account has been ${user?.isActive ? "activated" : "disabled"
        }`,
    });
  } else {
    res.status(404).json({ status: false, message: "User not found" });
  }
});

const changeUserPassword = asyncHandler(async (req, res) => {
  const { userId } = req.user;

  // Remove this condition
  if (userId === "65ff94c7bb2de638d0c73f63") {
    return res.status(404).json({
      status: false,
      message: "This is a test user. You can not chnage password. Thank you!!!",
    });
  }

  const user = await User.findById(userId);

  if (user) {
    user.password = req.body.password;

    await user.save();

    user.password = undefined;

    res.status(201).json({
      status: true,
      message: `Password chnaged successfully.`,
    });
  } else {
    res.status(404).json({ status: false, message: "User not found" });
  }
});

// DELETE - delete user account
const deleteUserProfile = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await User.findByIdAndDelete(id);

  res.status(200).json({ status: true, message: "User deleted successfully" });
});

// GET - pending requests visible to current approver
const getPendingRequests = asyncHandler(async (req, res) => {
  const approver = req.user;
  const query = getVisiblePendingQuery(approver);

  if (!query?._id && query?._id === null) {
    return res.status(403).json({ status: false, message: "Not authorized." });
  }

  const users = await User.find(query)
    .select(
      "_id name email prn role department year section rollNo facultyRole subjectsSkills status createdAt"
    )
    .sort({ createdAt: -1 });

  return res.status(200).json({ status: true, users });
});

// PUT - approve a user request (hierarchy enforced)
const approveUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const approver = req.user;

  const target = await User.findById(id);
  if (!target) {
    return res.status(404).json({ status: false, message: "User not found" });
  }

  if (target.status === "approved") {
    return res.status(200).json({ status: true, message: "Already approved." });
  }

  if (!canApproveTarget({ approver, target })) {
    return res.status(403).json({ status: false, message: "Not authorized." });
  }

  target.status = "approved";
  target.approvedBy = approver.userId;
  target.approvedAt = new Date();
  await target.save();

  if (target.email && isEmailConfigured()) {
    try {
      await sendEmail({
        to: target.email,
        subject: "Account approved",
        text: "Your account has been approved. You can now login.",
      });
    } catch (e) {
      console.error("[email] approval email failed", e?.message || e);
    }
  }

  return res.status(200).json({ status: true, message: "Approved successfully." });
});

// PUT - reject a user request (optional flow)
const rejectUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const approver = req.user;

  const target = await User.findById(id);
  if (!target) {
    return res.status(404).json({ status: false, message: "User not found" });
  }

  if (!canApproveTarget({ approver, target })) {
    return res.status(403).json({ status: false, message: "Not authorized." });
  }

  target.status = "rejected";
  target.approvedBy = approver.userId;
  target.approvedAt = new Date();
  target.isActive = false;
  await target.save();

  if (target.email && isEmailConfigured()) {
    try {
      await sendEmail({
        to: target.email,
        subject: "Account not approved",
        text: "Your request was not approved.",
      });
    } catch (e) {
      console.error("[email] rejection email failed", e?.message || e);
    }
  }

  return res.status(200).json({ status: true, message: "Rejected successfully." });
});

/**
 * POST - Create a user directly via hierarchy (no "pending request" flow).
 * Admin -> Principal/HOD
 * Principal -> HOD
 * HOD -> Faculty (same department)
 * Faculty -> Student (same department)
 */
const createManagedUser = asyncHandler(async (req, res) => {
  const creator = req.user;
  const creatorRank = getRoleRank(creator);

  const {
    name,
    email,
    password,
    role,
    department,
    year,
    section,
    rollNo,
    prn,
    facultyRole,
    subjectsSkills,
  } = req.body;

  const requestedRole = normalizeRole(role);
  if (!requestedRole) {
    return res.status(400).json({ status: false, message: "Role is required." });
  }

  if (!canAssignToTargetRank(creatorRank, requestedRole)) {
    return res.status(403).json({
      status: false,
      message:
        "Not authorized to create this role. Allowed chain: Admin->(Principal/HOD), Principal->HOD, HOD->Faculty, Faculty->Student.",
    });
  }

  const creatorRole = normalizeRole(creator?.role);
  const creatorDept = normalizeDept(creator?.department);

  // Enforce department rules for HOD/Faculty creators (same-dept only).
  let requestedDept = normalizeDept(department);
  if (creatorRole === "HOD" || creatorRole === "Faculty") {
    if (!creatorDept) {
      return res.status(400).json({
        status: false,
        message: "Your account has no department set. Contact admin.",
      });
    }
    requestedDept = creatorDept;
  }

  const emailValue = email ? String(email).trim().toLowerCase() : "";
  const prnValue = prn ? String(prn).trim() : "";

  if (!String(name || "").trim()) {
    return res.status(400).json({ status: false, message: "Name is required." });
  }

  if (requestedRole !== "Student" && !emailValue) {
    return res.status(400).json({ status: false, message: "Email is required." });
  }

  if (requestedRole === "Student" && !prnValue) {
    return res.status(400).json({ status: false, message: "PRN is required." });
  }

  if (!["Principal", "Admin"].includes(requestedRole) && !requestedDept) {
    return res.status(400).json({ status: false, message: "Department is required." });
  }

  const pwd = String(password || "").trim() || emailValue || prnValue;
  if (!pwd) {
    return res.status(400).json({ status: false, message: "Password is required." });
  }

  if (emailValue) {
    const userExists = await User.findOne({ email: emailValue });
    if (userExists) {
      return res.status(400).json({ status: false, message: "Email address already exists" });
    }
  }

  if (prnValue) {
    const prnExists = await User.findOne({ prn: prnValue });
    if (prnExists) {
      return res.status(400).json({ status: false, message: "PRN already exists" });
    }
  }

  const isAdmin = requestedRole === "Admin";

  const user = await User.create({
    name: String(name).trim(),
    email: emailValue || undefined,
    prn: prnValue || undefined,
    password: pwd,
    isAdmin,
    role: requestedRole,
    title: requestedRole,
    department: requestedDept,
    year: year ? String(year).trim() : "",
    section: section ? String(section).trim() : "",
    rollNo: rollNo ? String(rollNo).trim() : "",
    facultyRole: facultyRole ? String(facultyRole).trim() : "",
    subjectsSkills: Array.isArray(subjectsSkills)
      ? subjectsSkills.map((s) => String(s).trim()).filter(Boolean)
      : typeof subjectsSkills === "string"
        ? subjectsSkills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    status: "approved",
    approvedBy: creator?.userId || null,
    approvedAt: new Date(),
  });

  if (!user) {
    return res.status(400).json({ status: false, message: "Invalid user data" });
  }

  user.password = undefined;

  return res.status(201).json({
    status: true,
    message: "User created successfully.",
    user: {
      _id: user._id,
      name: user.name,
      isAdmin: user.isAdmin,
      email: user.email,
      prn: user.prn,
      role: user.role,
      title: user.title,
      department: user.department,
      year: user.year,
      section: user.section,
      rollNo: user.rollNo,
      facultyRole: user.facultyRole,
      status: user.status,
      approvedBy: user.approvedBy,
      isActive: user.isActive,
    },
  });
});

export {
  activateUserProfile,
  createManagedUser,
  changeUserPassword,
  deleteUserProfile,
  getTeamList,
  getPendingRequests,
  approveUser,
  rejectUser,
  loginUser,
  logoutUser,
  registerUser,
  updateUserProfile,
  getNotificationsList,
  markNotificationRead,
};
