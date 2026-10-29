import { NextResponse, type NextRequest } from "next/server";
import { searchUniversities } from "@/lib/education/universities";


export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q") || "";
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 50);

    const universities = await searchUniversities(query, limit);

    return NextResponse.json(
      {
        query,
        count: universities.length,
        universities,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to search universities", details: message },
      { status: 500 }
    );
  }
}
