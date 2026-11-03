import fs from "fs";
import { createClient } from "@supabase/supabase-js";

// Load environment variables
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const [k, ...v] = l.trim().split("=");
      return [k.trim(), v.join("=").trim().replace(/^['"]|['"]$/g, "")];
    })
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const demoPassword = process.env.DEMO_USER_PASSWORD || env.DEMO_USER_PASSWORD;
if (!demoPassword) {
  console.error("Missing DEMO_USER_PASSWORD in environment. Please set DEMO_USER_PASSWORD in .env.local or environment variables.");
  process.exit(1);
}

export const DEMO_CONFIG = {
  email: process.env.DEMO_USER_EMAIL || env.DEMO_USER_EMAIL || "demo@smartcv.dev",
  password: demoPassword,
  profile: {
    first_name: "Yassine",
    last_name: "Ben Salem",
    country: "Tunisie",
    city: "Tunis",
    school: "ESPRIT - École Supérieure Privée d'Ingénierie et de Technologies",
    degree: "Diplôme National d'Ingénieur",
    specialty: "Génie Logiciel & Systèmes d'Information",
    languages: ["Français", "Anglais", "Arabe"],
    preferences: {
      desired_role: "Stage PFE / Développeur Fullstack Junior",
      work_mode: "Hybride / Présentiel",
      availability: "Février 2026",
    },
  },
  cvData: {
    first_name: "Yassine",
    last_name: "Ben Salem",
    email: "demo@smartcv.dev",
    school: "ESPRIT - École Supérieure Privée d'Ingénierie et de Technologies",
    degree: "Diplôme National d'Ingénieur",
    specialty: "Génie Logiciel & Systèmes d'Information",
    skills: [
      "TypeScript",
      "Next.js",
      "React",
      "Node.js",
      "PostgreSQL",
      "Tailwind CSS",
      "REST APIs",
      "Docker",
      "Git",
    ],
    experience: [
      {
        role: "Stagiaire Développeur Web",
        company: "Digital Innovation Lab",
        duration: "Juillet 2025 - Septembre 2025",
        description: "Conception et implémentation de composants React et microservices Node.js.",
      },
    ],
    education: [
      {
        institution: "ESPRIT",
        degree: "Cycle Ingénieur Informatique (Génie Logiciel)",
        year: "2023 - 2026",
      },
    ],
  },
};

async function seedDemoAccount() {
  const isReset = process.argv.includes("--reset");
  console.log(`=== Seeding Demo Account on ${supabaseUrl} ${isReset ? "[RESET MODE]" : ""} ===`);
  const { email, password, profile, cvData } = DEMO_CONFIG;

  // 1. Check if demo user exists in auth.users
  const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  if (listErr) {
    throw new Error(`Failed to list users: ${listErr.message}`);
  }

  let demoUser = usersData.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (!demoUser) {
    console.log(`Creating new demo user: ${email}...`);
    const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        is_demo: true,
        full_name: `${profile.first_name} ${profile.last_name}`,
      },
    });

    if (createErr || !createData.user) {
      throw new Error(`Failed to create demo user: ${createErr?.message}`);
    }
    demoUser = createData.user;
    console.log(`Demo user created with ID: ${demoUser.id}`);
  } else {
    console.log(`Demo user exists with ID: ${demoUser.id}. Ensuring password & confirmed status...`);
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(demoUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        is_demo: true,
        full_name: `${profile.first_name} ${profile.last_name}`,
      },
    });
    if (updateErr) {
      console.warn(`Warning updating user credentials: ${updateErr.message}`);
    }
  }

  const userId = demoUser.id;

  // STRICT SAFETY ASSERTION: Ensure userId matches demo user
  if (!demoUser.email || demoUser.email.toLowerCase() !== email.toLowerCase()) {
    throw new Error(`[SECURITY ABORT] Refusing execution: Target user ${demoUser.email} does not match demo email ${email}.`);
  }

  // If in reset mode, cleanly purge only the demo user's existing records
  if (isReset) {
    console.log(`[RESET MODE ACTIVATED] Purging prior demo records for user ${userId} (${email})...`);
    const { data: demoApps } = await supabaseAdmin
      .from("applications")
      .select("id")
      .eq("user_id", userId);

    if (demoApps && demoApps.length > 0) {
      const demoAppIds = demoApps.map((a) => a.id);
      await supabaseAdmin.from("email_drafts").delete().in("application_id", demoAppIds);
      await supabaseAdmin.from("applications").delete().eq("user_id", userId);
      console.log(`Purged ${demoAppIds.length} demo applications and linked drafts.`);
    }

    await supabaseAdmin.from("resumes").delete().eq("user_id", userId);
    console.log(`[SAFETY CHECK PASSED] Cleaned demo records strictly for user ID: ${userId}. Real user data untouched.`);
  }

  // 2. Upsert profile in public.profiles
  console.log(`Ensuring profile for user ${userId}...`);
  const { error: profileErr } = await supabaseAdmin.from("profiles").upsert(
    {
      id: userId,
      email: email,
      first_name: profile.first_name,
      last_name: profile.last_name,
      country: profile.country,
      city: profile.city,
      school: profile.school,
      degree: profile.degree,
      specialty: profile.specialty,
      languages: profile.languages,
      preferences: profile.preferences,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (profileErr) {
    throw new Error(`Failed to upsert demo profile: ${profileErr.message}`);
  }
  console.log("Profile upserted successfully.");

  // 3. Ensure a realistic resume in public.resumes
  console.log(`Checking existing resumes for demo user...`);
  const { data: existingResumes } = await supabaseAdmin
    .from("resumes")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  let resumeId;
  const rawCvText = `
YASSINE BEN SALEM
Étudiant en Génie Logiciel à ESPRIT
Email: demo@smartcv.dev | Tunis, Tunisie

COMPÉTENCES TECHNIQUES
- Langages & Frameworks: TypeScript, JavaScript, Next.js, React, Node.js, Python, SQL
- Bases de données: PostgreSQL, Supabase, Redis
- Outils & DevOps: Git, Docker, GitHub Actions, Tailwind CSS, REST APIs

FORMATION
- ESPRIT (École Supérieure Privée d'Ingénierie et de Technologies)
  Diplôme National d'Ingénieur en Génie Logiciel (2023 - 2026)
  Disponibilité : Février 2026 pour Stage PFE de 6 mois

EXPÉRIENCES
- Stage Développeur Web | Digital Innovation Lab (Été 2025)
  Développement de fonctionnalités frontend sous React et Next.js.
  Optimisation des requêtes SQL et intégration d'API REST.
  `.trim();

  if (!existingResumes || existingResumes.length === 0) {
    console.log("Creating demo resume record...");
    const { data: newResume, error: resErr } = await supabaseAdmin
      .from("resumes")
      .insert({
        user_id: userId,
        storage_path: `${userId}/cv_demo_sample.pdf`,
        extracted_data: {
          data: cvData,
          rawText: rawCvText,
        },
        is_active: true,
      })
      .select("id")
      .single();

    if (resErr || !newResume) {
      throw new Error(`Failed to create demo resume: ${resErr?.message}`);
    }
    resumeId = newResume.id;
    console.log(`Demo resume created: ${resumeId}`);
  } else {
    resumeId = existingResumes[0].id;
    console.log(`Demo resume exists: ${resumeId}`);
  }

  // 4. Ensure demo opportunities & applications exist
  // Let's find existing opportunities to link
  const { data: opps } = await supabaseAdmin
    .from("opportunities")
    .select("id, title, company_id, companies(name)")
    .limit(3);

  if (!opps || opps.length === 0) {
    console.warn("No opportunities found to attach demo applications.");
  } else {
    console.log(`Found ${opps.length} opportunities for demo applications.`);
    for (let i = 0; i < opps.length; i++) {
      const opp = opps[i];
      const { data: existingApp } = await supabaseAdmin
        .from("applications")
        .select("id")
        .eq("user_id", userId)
        .eq("opportunity_id", opp.id)
        .maybeSingle();

      let appId;
      const status = i === 0 ? "draft" : i === 1 ? "approved" : "sent";

      if (!existingApp) {
        console.log(`Creating demo application for opportunity "${opp.title}" (status: ${status})...`);
        const { data: newApp, error: appErr } = await supabaseAdmin
          .from("applications")
          .insert({
            user_id: userId,
            company_id: opp.company_id,
            opportunity_id: opp.id,
            resume_id: resumeId,
            status: status,
            sent_at: status === "sent" ? new Date().toISOString() : null,
          })
          .select("id")
          .single();

        if (appErr || !newApp) {
          console.warn(`Could not create application for opp ${opp.id}: ${appErr?.message}`);
          continue;
        }
        appId = newApp.id;
      } else {
        appId = existingApp.id;
        console.log(`Application already exists for opp "${opp.title}": ${appId}`);
      }

      // 5. Ensure draft exists for this application
      const companyName = opp.companies?.name || "Entreprise";
      const subject = `Candidature Stage PFE : ${opp.title} - Yassine Ben Salem`;
      const body = `Madame, Monsieur,

Actuellement étudiant en dernière année du Cycle Ingénieur en Génie Logiciel à ESPRIT (École Supérieure Privée d'Ingénierie et de Technologies), je vous soumets ma candidature pour l'opportunité « ${opp.title} » au sein de ${companyName}.

Passionné par l'écosystème web moderne (TypeScript, Next.js, React, PostgreSQL), j'ai développé au cours de mon parcours académique et de mes projets une solide rigueur dans la conception d'architectures logicielles fiables et performantes.

Mon calendrier universitaire prévoyant un stage de fin d'études (PFE) à temps plein à partir de février 2026 pour une durée de 6 mois, je serais ravi d'échanger avec vous sur les projets et défis techniques de ${companyName}.

Vous trouverez mon CV ci-joint détaillant mes compétences et réalisations.

Je vous remercie vivement pour l'attention portée à ma candidature.

Cordialement,

Yassine Ben Salem
Élève-Ingénieur Génie Logiciel — ESPRIT
demo@smartcv.dev | Tunis, Tunisie`;

      const { data: existingDraft } = await supabaseAdmin
        .from("email_drafts")
        .select("id")
        .eq("application_id", appId)
        .maybeSingle();

      if (!existingDraft) {
        console.log(`Creating email draft for app ${appId}...`);
        const { error: draftErr } = await supabaseAdmin.from("email_drafts").insert({
          application_id: appId,
          recipient_email: "recrutement@demo-stage.tn",
          subject: subject,
          body: body,
          approved_at: status !== "draft" ? new Date().toISOString() : null,
          approved_hash: "demo_hash_verified",
        });
        if (draftErr) {
          console.warn(`Could not create draft for app ${appId}: ${draftErr.message}`);
        }
      }
    }
  }

  console.log("\n=== Demo Account Seeding Complete! ===");
  console.log(`Email: ${email}`);
  console.log("Password: [CONFIGURED IN ENVIRONMENT]");
  console.log(`User ID: ${userId}`);
}

seedDemoAccount().catch((err) => {
  console.error("Fatal error during demo seeding:", err);
  process.exit(1);
});
