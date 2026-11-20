import axios from "axios";
import { getAccessToken } from "../lib/supabaseAuth.js";

async function authHeaders() {
  const token = await getAccessToken();
  if (!token) throw new Error("Not signed in");
  return { Authorization: `Bearer ${token}` };
}

export async function fetchTesters() {
  const headers = await authHeaders();
  const { data } = await axios.get("/api/admin/testers", { headers });
  return data;
}

export async function createTester({ displayName, username, password }) {
  const headers = await authHeaders();
  const { data } = await axios.post(
    "/api/admin/testers",
    {
      display_name: displayName,
      username,
      password,
    },
    { headers }
  );
  return data;
}

export async function deleteTester(testerId) {
  const headers = await authHeaders();
  const { data } = await axios.delete(`/api/admin/testers/${testerId}`, { headers });
  return data;
}

/** @deprecated use deleteTester */
export const deactivateTester = deleteTester;

function formatApiError(err) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
  }
  return err?.message || "Request failed";
}

export { formatApiError };

/** Map API row → legacy registry shape for existing UI */
export function testerRowToRegistryEntry(row) {
  return {
    id: row.username,
    username: row.username,
    displayName: row.display_name,
    password: "—",
    builtin: false,
    bayId: row.bay_id,
    userId: row.id,
    isActive: row.is_active !== false,
  };
}
