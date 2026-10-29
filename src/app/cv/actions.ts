"use server";

import { createClient } from "@/utils/supabase/server";
import { parseAndExtractCV } from "@/lib/cv-parser";
import { redirect } from "next/navigation";
import { sanitizeProfileData } from "@/lib/profile-utils";
import { checkRateLimit } from "@/lib/rate-limiter";

export async function uploadCV(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=" + encodeURIComponent("Please log in to upload your CV"));
  }

  // Rate limit: max 5 CV uploads per 10 minutes per candidate
  const rateLimit = await checkRateLimit(supabase, `cv_upload:${user.id}`, 5, 600);
  if (!rateLimit.allowed) {
    redirect(`/cv?error=${encodeURIComponent(rateLimit.reason || "Upload rate limit reached. Please wait before uploading another CV.")}`);
  }

  const file = formData.get("cv_file") as File;
  if (!file) {
    redirect("/cv?error=" + encodeURIComponent("No file uploaded"));
  }
  
  if (file.type !== "application/pdf") {
    redirect("/cv?error=" + encodeURIComponent("Only PDF files are allowed"));
  }

  if (file.size > 5 * 1024 * 1024) {
    redirect("/cv?error=" + encodeURIComponent("File size must be under 5MB"));
  }

  // Read binary PDF buffer
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // Parse actual text and extract verifiable candidate fields
  const extractionResult = await parseAndExtractCV(uint8Array);

  // Generate an isolated tenant path for the candidate's CV
  const timestamp = Date.now();
  const filePath = `${user.id}/cv_${timestamp}.pdf`;

  const { error: uploadError } = await supabase
    .storage
    .from("resumes")
    .upload(filePath, file, { upsert: true });

  if (uploadError) {
    redirect(`/cv?error=${encodeURIComponent("Failed to upload CV to storage: " + uploadError.message)}`);
  }

  // Store the resume record with real extracted data (no mock placeholders)
  const { data: resumeRecord, error: dbError } = await supabase
    .from("resumes")
    .insert({
      user_id: user.id,
      storage_path: filePath,
      extracted_data: extractionResult,
    })
    .select()
    .single();

  if (dbError || !resumeRecord) {
    redirect(`/cv?error=${encodeURIComponent("Failed to save resume record: " + (dbError?.message || "Unknown error"))}`);
  }

  // Redirect to review page
  redirect(`/cv/review?resume_id=${resumeRecord.id}`);
}

export async function saveExtractedData(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=" + encodeURIComponent("Please log in to save your profile"));
  }

  // Fetch current profile to ensure no non-empty values are accidentally lost
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // Clean and sanitize the reviewed profile data
  const profileData = sanitizeProfileData(user, formData);

  // Merge with existing profile data: never overwrite existing non-null fields with null
  const mergedProfile = {
    ...profileData,
    first_name: profileData.first_name || existingProfile?.first_name || null,
    last_name: profileData.last_name || existingProfile?.last_name || null,
    country: profileData.country || existingProfile?.country || null,
    city: profileData.city || existingProfile?.city || null,
    school: profileData.school || existingProfile?.school || null,
    degree: profileData.degree || existingProfile?.degree || null,
    specialty: profileData.specialty || existingProfile?.specialty || null,
    languages: profileData.languages && profileData.languages.length > 0
      ? profileData.languages
      : existingProfile?.languages || [],
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("profiles")
    .upsert(mergedProfile, { onConflict: "id" });

  if (error) {
    redirect(`/profile?error=${encodeURIComponent("Failed to update profile: " + error.message)}`);
  }

  redirect("/profile?success=" + encodeURIComponent("CV details verified and saved to your profile."));
}
