import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }

  // Next.js redirect() throws an error to perform the redirect, 
  // so this return will never be reached.
  return null;
}
