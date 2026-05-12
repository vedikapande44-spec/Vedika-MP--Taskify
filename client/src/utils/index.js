export const formatDate = (date) => {
  // Get the month, day, and year
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const year = date.getFullYear();

  // Format the date as "MM dd, yyyy"
  const formattedDate = `${day}-${month}-${year}`;

  return formattedDate;
};

export function dateFormatter(dateString) {
  const inputDate = new Date(dateString);

  if (isNaN(inputDate)) {
    return "Invalid Date";
  }

  const year = inputDate.getFullYear();
  const month = String(inputDate.getMonth() + 1).padStart(2, "0");
  const day = String(inputDate.getDate()).padStart(2, "0");

  const formattedDate = `${year}-${month}-${day}`;
  return formattedDate;
}

export function getInitials(fullName) {
  const safe = String(fullName || "").trim();
  if (!safe) return "?";

  const names = safe.split(/\s+/).filter(Boolean);
  const initials = names
    .slice(0, 2)
    .map((name) => String(name || "").charAt(0))
    .filter(Boolean)
    .map((ch) => ch.toUpperCase());

  return initials.join("") || "?";
}

export const updateURL = ({ searchTerm, navigate, location }) => {
  const params = new URLSearchParams();

  if (searchTerm) {
    params.set("search", searchTerm);
  }

  const newURL = `${location?.pathname}?${params.toString()}`;
  navigate(newURL, { replace: true });

  return newURL;
};

export const PRIOTITYSTYELS = {
  high: "text-red-600",
  medium: "text-yellow-600",
  low: "text-blue-600",
};

export const TASK_TYPE = {
  todo: "bg-blue-600",
  "in progress": "bg-yellow-600",
  completed: "bg-green-600",
};

export const BGS = [
  "bg-blue-600",
  "bg-yellow-600",
  "bg-red-600",
  "bg-green-600",
];

export const DEPARTMENTS = ["COMP", "IT", "ENTC", "MECH", "CIVIL", "OTHER"];

export const YEARS = ["FE", "SE", "TE", "BE"];

/** Admin, Principal, HOD, or Faculty — not Student */
export function canManageTasks(user) {
  if (!user) return false;
  const r = user.role ? String(user.role).trim() : "";
  if (user.isAdmin || r === "Admin" || r === "Principal") return true;
  return r === "HOD" || r === "Faculty";
}
