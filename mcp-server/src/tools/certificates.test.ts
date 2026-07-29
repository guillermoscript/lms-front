import { describe, it, expect } from "vitest";
import {
  certificateStatus,
  describeEligibility,
  originForHost,
  verifyUrlFor,
} from "./certificates.js";

/**
 * Unit tests for the pure helpers behind the certificate tools. The Supabase
 * calls themselves are covered by RLS and the `issue_certificate_if_eligible`
 * function; what is worth pinning here is the shaping the widgets depend on.
 */

const NOW = new Date("2026-07-29T12:00:00.000Z");

describe("certificateStatus", () => {
  it("is valid when there is no expiry and no revocation", () => {
    expect(certificateStatus({ revoked_at: null, expires_at: null }, NOW)).toBe("valid");
  });

  it("is valid when the expiry is still in the future", () => {
    expect(
      certificateStatus({ revoked_at: null, expires_at: "2027-01-01T00:00:00Z" }, NOW)
    ).toBe("valid");
  });

  it("is expired once a non-null expiry has passed", () => {
    expect(
      certificateStatus({ revoked_at: null, expires_at: "2026-02-02T09:00:00Z" }, NOW)
    ).toBe("expired");
  });

  it("revoked wins over expired", () => {
    expect(
      certificateStatus(
        { revoked_at: "2026-03-01T00:00:00Z", expires_at: "2026-02-02T00:00:00Z" },
        NOW
      )
    ).toBe("revoked");
  });
});

describe("originForHost", () => {
  it("uses https for real domains", () => {
    expect(originForHost("code-academy.lmsplatform.com")).toBe(
      "https://code-academy.lmsplatform.com"
    );
  });

  it("uses http for the lvh.me / localhost dev hosts, port included", () => {
    expect(originForHost("default.lvh.me:3000")).toBe("http://default.lvh.me:3000");
    expect(originForHost("localhost:3000")).toBe("http://localhost:3000");
  });
});

describe("verifyUrlFor", () => {
  it("builds the public verify path", () => {
    expect(verifyUrlFor("https://school.example.com", "ABC123")).toBe(
      "https://school.example.com/verify/ABC123"
    );
  });

  it("returns null when the origin or the code is unknown", () => {
    expect(verifyUrlFor(null, "ABC123")).toBeNull();
    expect(verifyUrlFor("https://school.example.com", null)).toBeNull();
  });
});

describe("describeEligibility", () => {
  it("reports an already-issued certificate with its id", () => {
    const out = describeEligibility({
      success: false,
      reason: "Certificate already issued",
      certificateId: "cert-1",
    });
    expect(out).toContain("already issued");
    expect(out).toContain("cert-1");
  });

  it("names the missing criteria when the student falls short", () => {
    const out = describeEligibility({
      success: false,
      reason: "Not eligible for certificate",
      completion: {
        eligible: false,
        completedLessons: 14,
        totalLessons: 22,
        submittedExams: 2,
        totalExams: 3,
        averageExamScore: 64,
        criteria: { minLessonCompletionPct: 100, minExamPassScore: 70 },
      },
    });
    expect(out).toContain("lessons 14/22");
    expect(out).toContain("needs 100%");
    expect(out).toContain("exams 2/3");
    expect(out).toContain("avg score 64");
  });

  it("passes the no-template refusal through verbatim — it is the fixable one", () => {
    // `calculate_course_completion` collapses a missing template into a plain
    // not-eligible with this reason and no completion figures at all.
    const out = describeEligibility({
      eligible: false,
      reason: "No active certificate template for this course",
    });
    expect(out).toBe("No active certificate template for this course.");
  });

  it("says eligible when the RPC reports success", () => {
    expect(
      describeEligibility({ success: true, eligible: true, completion: { eligible: true } })
    ).toContain("Eligible");
  });

  it("degrades gracefully on a null result", () => {
    expect(describeEligibility(null)).toContain("could not be determined");
  });
});
