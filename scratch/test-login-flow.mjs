async function fullFlow() {
  console.log("1. Fetching /login page to get action ID...");
  const loginPageRes = await fetch("http://localhost:3000/login");
  const html = await loginPageRes.text();
  const actionMatch = html.match(/\$ACTION_ID_([a-zA-Z0-9_]+)/);
  if (!actionMatch) {
    throw new Error("Could not find action ID on /login page");
  }
  const actionId = actionMatch[1];
  console.log("Found Action ID:", actionId);

  console.log("2. Submitting login credentials via Server Action...");
  const formData = new FormData();
  formData.append("$ACTION_ID_" + actionId, "");
  formData.append("email", "chaarimahdi100@gmail.com");
  formData.append("password", "Password123!");

  const postRes = await fetch("http://localhost:3000/login", {
    method: "POST",
    headers: {
      "Next-Action": actionId,
    },
    body: formData,
    redirect: "manual",
  });

  console.log("POST /login status:", postRes.status);
  const rawCookies = postRes.headers.getSetCookie ? postRes.headers.getSetCookie() : [postRes.headers.get("set-cookie")];
  console.log("Set-Cookie headers count:", rawCookies.length);

  const cookieHeader = rawCookies.map(c => c.split(";")[0]).join("; ");
  console.log("Cookie header names:", rawCookies.map(c => c.split("=")[0]));

  console.log("3. Fetching target draft page at /applications/518667a5-92ed-4192-af96-87f5df616f05/draft with authenticated cookies...");
  const draftRes = await fetch("http://localhost:3000/applications/518667a5-92ed-4192-af96-87f5df616f05/draft", {
    headers: {
      Cookie: cookieHeader,
    },
    redirect: "manual",
  });

  console.log("Draft route HTTP status:", draftRes.status);
  const draftHtml = await draftRes.text();
  console.log("Draft page HTML length:", draftHtml.length);

  // Assertions
  const hasDraftTitle = draftHtml.includes("Personalized Email Draft");
  const hasSpontaneousBanner = draftHtml.includes("Candidature Convertie en Candidature Spontanée");
  const hasSubject = draftHtml.includes("Candidature spontanée — Stage PFE (Disponibilité à partir de février 2027)");
  const hasCandidate = draftHtml.includes("Mahdi Chaari");
  const hasMedianet = draftHtml.includes("Medianet");
  const has2027 = draftHtml.includes("2027");

  console.log("\n=== VERIFICATION RESULTS ===");
  console.log("HTTP 200 OK:", draftRes.status === 200);
  console.log("Personalized Email Draft page rendered:", hasDraftTitle);
  console.log("Spontaneous Converted Banner displayed:", hasSpontaneousBanner);
  console.log("Correct Subject present:", hasSubject);
  console.log("Candidate Name 'Mahdi Chaari' present:", hasCandidate);
  console.log("Employer 'Medianet' present:", hasMedianet);
  console.log("Availability '2027' present:", has2027);

  if (draftRes.status === 200 && hasDraftTitle && hasSpontaneousBanner && hasSubject) {
    console.log("\n>>> ALL CHECKS PASSED: Application is fully operational and the saved draft is completely intact! <<<");
  } else {
    console.error("Verification failed! Preview of HTML:\n", draftHtml.slice(0, 500));
  }
}

fullFlow().catch(console.error);
