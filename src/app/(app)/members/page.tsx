import { redirect } from "next/navigation";

// /members was replaced by /roster (permanent roster).
export default function MembersRedirect() {
  redirect("/roster");
}
