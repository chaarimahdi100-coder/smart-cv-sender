export function formatLanguages(rawLanguages: string | null): string[] {
  if (!rawLanguages) return [];
  return rawLanguages
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function sanitizeProfileData(
  user: { id: string; email?: string },
  formData: FormData
) {
  return {
    id: user.id,
    first_name: (formData.get("first_name") as string)?.trim() || null,
    last_name: (formData.get("last_name") as string)?.trim() || null,
    email: user.email || "",
    country: (formData.get("country") as string)?.trim() || null,
    city: (formData.get("city") as string)?.trim() || null,
    school: (formData.get("school") as string)?.trim() || null,
    degree: (formData.get("degree") as string)?.trim() || null,
    specialty: (formData.get("specialty") as string)?.trim() || null,
    languages: formatLanguages(formData.get("languages") as string),
    updated_at: new Date().toISOString(),
  };
}
