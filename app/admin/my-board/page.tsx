import { redirect } from "next/navigation";

export default function MyBoardRedirect() {
  redirect("/admin/tickets/my-board");
}
