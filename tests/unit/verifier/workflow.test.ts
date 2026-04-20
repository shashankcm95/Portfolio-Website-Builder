import { verifyWorkflow } from "@/lib/pipeline/verifier/workflow";

describe("verifyWorkflow", () => {
  const workflows = [
    { name: "CI", category: "test" as const },
    { name: "Deploy", category: "deploy" as const },
    { name: "Lint", category: "lint" as const },
  ];

  it("verifies a category that's present", () => {
    const r = verifyWorkflow({ kind: "workflow", category: "test" }, workflows);
    expect(r.status).toBe("verified");
    expect(r.evidence).toMatch(/CI \(test\)/);
  });

  it("flags a category that's absent", () => {
    const r = verifyWorkflow(
      { kind: "workflow", category: "security" },
      workflows
    );
    expect(r.status).toBe("flagged");
    expect(r.evidence).toMatch(/security/);
  });

  it("flags when the workflow list is empty", () => {
    const r = verifyWorkflow({ kind: "workflow", category: "test" }, []);
    expect(r.status).toBe("flagged");
  });
});
