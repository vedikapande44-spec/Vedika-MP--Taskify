import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { Button, Loading, Textbox } from "../components";
import { useRegisterMutation } from "../redux/slices/api/authApiSlice";
import { setCredentials } from "../redux/slices/authSlice";

const ROLES = ["Admin", "Principal", "HOD", "Faculty", "Student"];
const DEPARTMENTS = ["COMP", "IT", "ENTC", "MECH", "CIVIL", "OTHER"];
const YEARS = ["FE", "SE", "TE", "BE"];
const FACULTY_ROLES = ["Faculty", "Student Incharge", "Project Guide"];

const Register = () => {
  const { user } = useSelector((state) => state.auth);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [registerUser, { isLoading }] = useRegisterMutation();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: {
      role: "",
      department: "",
    },
  });

  const role = watch("role");
  const department = watch("department");
  const password = watch("password");

  const showSection = role === "Student" && department === "COMP";

  const roleHint = useMemo(() => {
    if (!role) return "Select a role to continue.";
    if (role === "Admin") return "Admin accounts are created with a secret key.";
    return "Your account will be pending until approved.";
  }, [role]);

  const onSubmit = async (data) => {
    const payload = { ...data };
    delete payload.confirmPassword;

    // Compact cleanup
    if (!payload.email) delete payload.email;
    if (!payload.section) delete payload.section;
    if (!payload.subjectsSkills) delete payload.subjectsSkills;
    if (!payload.facultyRole) delete payload.facultyRole;

    try {
      const res = await registerUser(payload).unwrap();
      toast.success(res?.message || "Registered");

      const userData = res?.user;
      const roleValue = userData?.role || payload?.role;
      const isApproved =
        userData?.status === "approved" ||
        userData?.isAdmin ||
        roleValue === "Admin";

      if (userData && isApproved) {
        dispatch(setCredentials(userData));

        if (userData?.isAdmin || roleValue === "Admin") {
          navigate("/admin-dashboard");
        } else if (roleValue === "HOD") {
          navigate("/hod-dashboard");
        } else if (roleValue === "Faculty") {
          navigate("/faculty-dashboard");
        } else if (roleValue === "Student") {
          navigate("/student-dashboard");
        } else {
          navigate("/employee-dashboard");
        }
      } else {
        navigate("/log-in");
      }
    } catch (err) {
      toast.error(err?.data?.message || err.error);
    }
  };

  useEffect(() => {
    if (user) navigate("/");
  }, [user]);

  // Reset role-specific fields when role changes
  useEffect(() => {
    setValue("prn", "");
    setValue("department", "");
    setValue("year", "");
    setValue("section", "");
    setValue("rollNo", "");
    setValue("facultyRole", "");
    setValue("subjectsSkills", "");
    setValue("secretKey", "");
  }, [role]);

  return (
    <div className='w-full min-h-screen flex items-center justify-center bg-[#f3f4f6]'>
      <div className='w-full max-w-lg bg-white border border-gray-200 rounded-md shadow-sm px-4 py-3'>
        <div className='flex items-start justify-between gap-3 mb-2'>
          <div>
            <p className='text-lg font-semibold text-gray-900'>Register</p>
            <p className='text-xs text-gray-500'>{roleHint}</p>
          </div>
          <Link to='/log-in' className='text-xs text-blue-600 hover:underline'>
            Back to login
          </Link>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className='flex flex-col gap-2'>
          {/* Step 1 */}
          <div className='grid grid-cols-2 gap-2'>
            <div className='w-full flex flex-col gap-1'>
              <span className='text-xs text-slate-900'>Role</span>
              <select
                className='border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 ring-blue-300'
                {...register("role", { required: "Role is required!" })}
              >
                <option value=''>Select</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {errors.role && (
                <span className='text-xs text-[#f64949fe]'>{errors.role.message}</span>
              )}
            </div>

            <div className='w-full flex flex-col gap-1'>
              <span className='text-xs text-slate-900'>Department</span>
              <select
                className='border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 ring-blue-300'
                {...register("department", {
                  validate: (val) => {
                    if (role === "Principal" || role === "Admin") return true;
                    if (!role) return true;
                    return val ? true : "Department is required!";
                  },
                })}
                disabled={!role || role === "Principal" || role === "Admin"}
              >
                <option value=''>Select</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              {errors.department && (
                <span className='text-xs text-[#f64949fe]'>
                  {errors.department.message}
                </span>
              )}
            </div>
          </div>

          <Textbox
            placeholder='Full name'
            type='text'
            name='name'
            label='Name'
            labelClass='text-xs'
            className='w-full rounded px-2 py-1.5 text-sm'
            register={register("name", { required: "Name is required!" })}
            error={errors.name?.message || ""}
          />

          {/* Role-based fields */}
          {role === "Student" && (
            <Textbox
              placeholder='PRN'
              type='text'
              name='prn'
              label='PRN'
              labelClass='text-xs'
              className='w-full rounded px-2 py-1.5 text-sm'
              register={register("prn", { required: "PRN is required!" })}
              error={errors.prn?.message || ""}
            />
          )}

          <Textbox
            placeholder='Email (optional for Student)'
            type='email'
            name='email'
            label='Email'
            labelClass='text-xs'
            className='w-full rounded px-2 py-1.5 text-sm'
            register={register("email", {
              validate: (val) => {
                if (!val) return true;
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) || "Invalid email";
              },
            })}
            error={errors.email?.message || ""}
          />

          {role === "Admin" && (
            <Textbox
              placeholder='Secret key'
              type='password'
              name='secretKey'
              label='Secret Key'
              labelClass='text-xs'
              className='w-full rounded px-2 py-1.5 text-sm'
              register={register("secretKey", {
                required: "Secret key is required!",
              })}
              error={errors.secretKey?.message || ""}
            />
          )}

          {(role === "Faculty" || role === "Student") && (
            <div className='grid grid-cols-2 gap-2'>
              <div className='w-full flex flex-col gap-1'>
                <span className='text-xs text-slate-900'>Year</span>
                <select
                  className='border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 ring-blue-300'
                  {...register("year", { required: "Year is required!" })}
                >
                  <option value=''>Select</option>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                {errors.year && (
                  <span className='text-xs text-[#f64949fe]'>{errors.year.message}</span>
                )}
              </div>

              {showSection ? (
                <Textbox
                  placeholder='Section'
                  type='text'
                  name='section'
                  label='Section'
                  labelClass='text-xs'
                  className='w-full rounded px-2 py-1.5 text-sm'
                  register={register("section", { required: "Section is required!" })}
                  error={errors.section?.message || ""}
                />
              ) : (
                <div className='w-full flex flex-col gap-1'>
                  <span className='text-xs text-slate-900'>Section</span>
                  <input
                    className='border border-gray-200 rounded px-2 py-1.5 text-sm bg-gray-50'
                    value={showSection ? department : "N/A"}
                    disabled
                  />
                </div>
              )}
            </div>
          )}

          {role === "Faculty" && (
            <>
              <Textbox
                placeholder='Subjects / Skills (comma separated)'
                type='text'
                name='subjectsSkills'
                label='Subjects / Skills'
                labelClass='text-xs'
                className='w-full rounded px-2 py-1.5 text-sm'
                register={register("subjectsSkills", {
                  required: "Subjects / Skills is required!",
                })}
                error={errors.subjectsSkills?.message || ""}
              />

              <div className='w-full flex flex-col gap-1'>
                <span className='text-xs text-slate-900'>Faculty Role</span>
                <select
                  className='border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 ring-blue-300'
                  {...register("facultyRole", { required: "Faculty role is required!" })}
                >
                  <option value=''>Select</option>
                  {FACULTY_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {errors.facultyRole && (
                  <span className='text-xs text-[#f64949fe]'>
                    {errors.facultyRole.message}
                  </span>
                )}
              </div>
            </>
          )}

          {role === "Student" && (
            <Textbox
              placeholder='Roll No'
              type='text'
              name='rollNo'
              label='Roll No'
              labelClass='text-xs'
              className='w-full rounded px-2 py-1.5 text-sm'
              register={register("rollNo", { required: "Roll No is required!" })}
              error={errors.rollNo?.message || ""}
            />
          )}

          <Textbox
            placeholder='Create a password'
            type='password'
            name='password'
            label='Password'
            labelClass='text-xs'
            className='w-full rounded px-2 py-1.5 text-sm'
            register={register("password", {
              required: "Password is required!",
              minLength: { value: 6, message: "Min 6 characters" },
            })}
            error={errors.password?.message || ""}
          />

          <Textbox
            placeholder='Confirm password'
            type='password'
            name='confirmPassword'
            label='Confirm Password'
            labelClass='text-xs'
            className='w-full rounded px-2 py-1.5 text-sm'
            register={register("confirmPassword", {
              required: "Please confirm!",
              validate: (val) => val === password || "Passwords do not match!",
            })}
            error={errors.confirmPassword?.message || ""}
          />

          {isLoading ? (
            <Loading />
          ) : (
            <Button
              type='submit'
              label='Submit request'
              className='w-full h-9 bg-blue-700 text-white rounded mt-1'
            />
          )}

          <p className='text-center text-xs text-gray-600'>
            Already have an account?{" "}
            <Link to='/log-in' className='text-blue-600 hover:underline font-medium'>
              Log in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Register;