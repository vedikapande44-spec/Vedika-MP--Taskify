import clsx from "clsx";
import { useEffect, useState } from "react";
import { IoMdAdd } from "react-icons/io";
import { MdAdminPanelSettings, MdPerson } from "react-icons/md";
import { toast } from "sonner";
import {
  AddUser,
  Button,
  ConfirmatioDialog,
  Loading,
  Title,
  UserAction,
} from "../components";
import {
  useDeleteUserMutation,
  useGetTeamListsQuery,
  useUserActionMutation,
} from "../redux/slices/api/userApiSlice";
import { getInitials } from "../utils/index";
import { useSearchParams } from "react-router-dom";

// Colors for avatar backgrounds
const AVATAR_COLORS = [
  "bg-blue-600", "bg-violet-600", "bg-green-600",
  "bg-red-600", "bg-yellow-600", "bg-pink-600",
  "bg-indigo-600", "bg-teal-600",
];

const Users = () => {
  const [searchParams] = useSearchParams();
  const [searchTerm] = useState(searchParams.get("search") || "");

  const { data, isLoading, refetch } = useGetTeamListsQuery({
    search: searchTerm,
    excludeRole: "Student",
  });
  const [deleteUser] = useDeleteUserMutation();
  const [userAction] = useUserActionMutation();

  const [openDialog, setOpenDialog] = useState(false);
  const [open, setOpen] = useState(false);
  const [openAction, setOpenAction] = useState(false);
  const [selected, setSelected] = useState(null);

  const deleteClick = (id) => { setSelected(id); setOpenDialog(true); };
  const editClick = (el) => { setSelected(el); setOpen(true); };
  const userStatusClick = (el) => { setSelected(el); setOpenAction(true); };

  const deleteHandler = async () => {
    try {
      const res = await deleteUser(selected);
      refetch();
      toast.success(res?.data?.message);
      setSelected(null);
      setTimeout(() => setOpenDialog(false), 500);
    } catch (err) {
      toast.error(err?.data?.message || err.error);
    }
  };

  const userActionHandler = async () => {
    try {
      const res = await userAction({ isActive: !selected?.isActive, id: selected?._id });
      refetch();
      toast.success(res?.data?.message);
      setSelected(null);
      setTimeout(() => setOpenAction(false), 500);
    } catch (err) {
      toast.error(err?.data?.message || err.error);
    }
  };

  useEffect(() => { refetch(); }, [open]);

  // Summary counts
  const activeCount = data?.filter((u) => u.isActive).length || 0;
  const inactiveCount = data?.filter((u) => !u.isActive).length || 0;

  return isLoading ? (
    <div className="py-10"><Loading /></div>
  ) : (
    <>
      <div className="w-full md:px-1 px-0 mb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Title title="Team Members" />
          <Button
            label="Add New Member"
            icon={<IoMdAdd className="text-lg" />}
            className="flex flex-row-reverse gap-1 items-center bg-blue-600 text-white rounded-md 2xl:py-2.5"
            onClick={() => setOpen(true)}
          />
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-blue-700">{data?.length || 0}</p>
            <p className="text-sm text-gray-500">Total Members</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-green-600">{activeCount}</p>
            <p className="text-sm text-gray-500">Active</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm text-center">
            <p className="text-2xl font-bold text-red-500">{inactiveCount}</p>
            <p className="text-sm text-gray-500">Inactive</p>
          </div>
        </div>

        {/* Team Table */}
        <div className="bg-white dark:bg-[#1f1f1f] px-2 md:px-4 py-4 shadow-md rounded">
          <div className="overflow-x-auto">
            <table className="w-full mb-5">
              <thead className="border-b border-gray-300 dark:border-gray-600">
                <tr className="text-black dark:text-white text-left text-sm">
                  <th className="py-3 pr-4">Employee</th>
                  <th className="py-3 pr-4">Job Title</th>
                  <th className="py-3 pr-4">Role / Department</th>
                  <th className="py-3 pr-4">Email</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((user, index) => (
                  <tr
                    key={index}
                    className="border-b border-gray-200 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    {/* Employee Name + Avatar */}
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={clsx(
                            "w-10 h-10 rounded-full text-white flex items-center justify-center text-sm font-semibold flex-shrink-0",
                            AVATAR_COLORS[index % AVATAR_COLORS.length]
                          )}
                        >
                          {getInitials(user.name)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800 dark:text-gray-200">{user.name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {user.isAdmin ? (
                              <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                <MdAdminPanelSettings className="text-xs" />
                                Admin
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                                <MdPerson className="text-xs" />
                                Employee
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Job Title */}
                    <td className="p-3">
                      <p className="text-sm font-medium text-gray-700">{user.title || "—"}</p>
                    </td>

                    {/* Role */}
                    <td className="p-3">
                      <span className="text-sm bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
                        {user.role || "—"}
                      </span>
                    </td>

                    {/* Email */}
                    <td className="p-3 text-sm text-gray-500">{user.email}</td>

                    {/* Active Status */}
                    <td className="p-3">
                      <button
                        onClick={() => userStatusClick(user)}
                        className={clsx(
                          "px-3 py-1 rounded-full text-xs font-medium transition",
                          user?.isActive
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-red-100 text-red-600 hover:bg-red-200"
                        )}
                      >
                        {user?.isActive ? "● Active" : "● Inactive"}
                      </button>
                    </td>

                    {/* Edit / Delete */}
                    <td className="p-3">
                      <div className="flex gap-3">
                        <Button
                          className="text-blue-600 hover:text-blue-500 text-sm font-semibold sm:px-0"
                          label="Edit"
                          type="button"
                          onClick={() => editClick(user)}
                        />
                        <Button
                          className="text-red-600 hover:text-red-400 text-sm font-semibold sm:px-0"
                          label="Delete"
                          type="button"
                          onClick={() => deleteClick(user?._id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AddUser
        open={open}
        setOpen={setOpen}
        userData={selected}
        key={new Date().getTime().toString()}
      />
      <ConfirmatioDialog
        open={openDialog}
        setOpen={setOpenDialog}
        onClick={deleteHandler}
      />
      <UserAction
        open={openAction}
        setOpen={setOpenAction}
        onClick={userActionHandler}
      />
    </>
  );
};

export default Users;