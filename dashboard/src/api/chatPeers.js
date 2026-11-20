import axios from "axios";
import { getAccessToken } from "../lib/supabaseAuth.js";
import { testerRowToRegistryEntry } from "./adminTesters.js";

async function authHeaders() {
  const token = await getAccessToken();
  if (!token) throw new Error("Not signed in");
  return { Authorization: `Bearer ${token}` };
}

/** Active tester accounts from Supabase (for Ops Chat thread list). */
export async function fetchChatPeers() {
  const headers = await authHeaders();
  const { data } = await axios.get("/api/chat/peers", { headers });
  return (data || []).map(testerRowToRegistryEntry);
}
