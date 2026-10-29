"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sanitizeProfileData } from "@/lib/profile-utils";

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=" + encodeURIComponent("Please log in to update your profile"));
  }

  const profileData = sanitizeProfileData(user, formData);

  const { error } = await supabase
    .from("profiles")
    .upsert(profileData, { onConflict: "id" });

  if (error) {
    redirect(
      `/profile?error=${encodeURIComponent(
        "Failed to update profile: " + error.message
      )}`
    );
  }

  revalidatePath("/profile");
  redirect("/profile?success=" + encodeURIComponent("Profile updated successfully."));
}
