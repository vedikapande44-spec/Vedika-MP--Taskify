import { AUTH_URL, USERS_URL } from "../../../utils/contants";
import { apiSlice } from "../apiSlice";

export const userApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    createManagedUser: builder.mutation({
      query: (data) => ({
        url: `${USERS_URL}/create`,
        method: "POST",
        body: data,
        credentials: "include",
      }),
    }),

    updateUser: builder.mutation({
      query: (data) => ({
        url: `${USERS_URL}/profile`,
        method: "PUT",
        body: data,
        credentials: "include",
      }),
    }),

    getTeamLists: builder.query({
      query: ({
        search = "",
        scope = "",
        department = "",
        year = "",
        section = "",
        role = "",
        excludeRole = "",
      } = {}) => {
        const q = new URLSearchParams();
        q.set("search", search);
        q.set("scope", scope);
        q.set("department", department);
        q.set("year", year);
        q.set("section", section);
        q.set("role", role);
        q.set("excludeRole", excludeRole);
        return {
          url: `${USERS_URL}/users?${q.toString()}`,
          method: "GET",
          credentials: "include",
        };
      },
    }),

    getNotifications: builder.query({
      query: () => ({
        url: `${USERS_URL}/notifications`,
        method: "GET",
        credentials: "include",
      }),
    }),

    deleteUser: builder.mutation({
      query: (id) => ({
        url: `${USERS_URL}/${id}`,
        method: "DELETE",
        credentials: "include",
      }),
    }),

    userAction: builder.mutation({
      query: (data) => ({
        url: `${USERS_URL}/${data?.id}`,
        method: "PUT",
        body: data,
        credentials: "include",
      }),
    }),

    markNotiAsRead: builder.mutation({
      query: (data) => ({
        url: `${USERS_URL}/read-noti?isReadType=${data.type}&id=${data?.id}`,
        method: "PUT",
        body: data,
        credentials: "include",
      }),
    }),

    changePassword: builder.mutation({
      query: (data) => ({
        url: `${USERS_URL}/change-password`,
        method: "PUT",
        body: data,
        credentials: "include",
      }),
    }),

    getPendingRequests: builder.query({
      query: () => ({
        url: `${AUTH_URL}/pending-requests`,
        method: "GET",
        credentials: "include",
      }),
    }),

    approveUser: builder.mutation({
      query: (id) => ({
        url: `${AUTH_URL}/approve/${id}`,
        method: "PUT",
        credentials: "include",
      }),
    }),

    rejectUser: builder.mutation({
      query: (id) => ({
        url: `${AUTH_URL}/reject/${id}`,
        method: "PUT",
        credentials: "include",
      }),
    }),
  }),
});

export const {
  useCreateManagedUserMutation,
  useUpdateUserMutation,
  useGetTeamListsQuery,
  useDeleteUserMutation,
  useUserActionMutation,
  useChangePasswordMutation,
  useGetNotificationsQuery,
  useMarkNotiAsReadMutation,
  useGetPendingRequestsQuery,
  useApproveUserMutation,
  useRejectUserMutation,
} = userApiSlice;
