import { expect, test } from "@playwright/test";

import { prisma } from "../lib/db";

const users = {
  systemAdmin: { email: "system.admin@kanban.local", password: "DevOnly123!" },
  departmentAdmin: { email: "alice.admin@kanban.local", password: "DevOnly123!" },
  manager: { email: "bob.manager@kanban.local", password: "DevOnly123!" },
  viewer: { email: "diana.viewer@kanban.local", password: "DevOnly123!" },
  employee: { email: "charlie.employee@kanban.local", password: "DevOnly123!" },
  formerMember: { email: "former.member@kanban.local", password: "DevOnly123!" },
  analyticsEmployee: { email: "grace.employee@kanban.local", password: "DevOnly123!" },
};

const INTERNAL_PROJECT_ID = "seed-project-internal-systems";
const ANALYTICS_PROJECT_ID = "seed-project-analytics-platform";
const createdMemberIds: string[] = [];
const createdActivityIds: string[] = [];

async function login(
  request: import("@playwright/test").APIRequestContext,
  credentials: { email: string; password: string },
) {
  const response = await request.post("/api/auth/login", {
    data: credentials,
  });

  expect(response.status()).toBe(200);
}

async function getUserId(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  expect(user).not.toBeNull();
  return user!.id;
}

test.afterAll(async () => {
  const activityCleanupFilters = [];

  if (createdActivityIds.length > 0) {
    activityCleanupFilters.push({ id: { in: createdActivityIds } });
  }

  if (createdMemberIds.length > 0) {
    activityCleanupFilters.push({
      entityType: "ProjectMember",
      entityId: { in: createdMemberIds },
    });
  }

  if (activityCleanupFilters.length > 0) {
    await prisma.activityLog.deleteMany({
      where: { OR: activityCleanupFilters },
    });
  }

  if (createdMemberIds.length > 0) {
    await prisma.projectMember.deleteMany({
      where: { id: { in: createdMemberIds } },
    });
  }

  await prisma.$disconnect();
});

test.describe("Project Members API", () => {
  test("returns 401 for unauthenticated read", async ({ request }) => {
    const response = await request.get(`/api/projects/${INTERNAL_PROJECT_ID}/members`);
    expect(response.status()).toBe(401);
  });

  test("returns 403 when user has no PROJECTS_READ for project department", async ({
    request,
  }) => {
    await login(request, users.formerMember);

    const response = await request.get(`/api/projects/${INTERNAL_PROJECT_ID}/members`);
    expect(response.status()).toBe(403);
  });

  test("system admin can read members and response does not leak secrets", async ({
    request,
  }) => {
    await login(request, users.systemAdmin);

    const response = await request.get(`/api/projects/${INTERNAL_PROJECT_ID}/members`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.members)).toBe(true);
    expect(body.members.length).toBeGreaterThan(0);

    const firstMember = body.members[0];
    expect(firstMember.user.passwordHash).toBeUndefined();
    expect(firstMember.user.sessions).toBeUndefined();
  });

  test("manager cannot read members of project from another department", async ({
    request,
  }) => {
    await login(request, users.manager);

    const response = await request.get(`/api/projects/${ANALYTICS_PROJECT_ID}/members`);
    expect(response.status()).toBe(403);
  });

  test("viewer cannot manage members", async ({ request }) => {
    await login(request, users.viewer);

    const targetUserId = await getUserId(users.viewer.email);
    const addResponse = await request.post(
      `/api/projects/${INTERNAL_PROJECT_ID}/members`,
      { data: { userId: targetUserId } },
    );
    expect(addResponse.status()).toBe(403);
  });

  test("department admin can read project member candidates with same-department active users only", async ({
    request,
  }) => {
    await login(request, users.departmentAdmin);

    const response = await request.get(
      `/api/projects/${INTERNAL_PROJECT_ID}/members/candidates`,
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.candidates)).toBe(true);

    const candidateEmails = body.candidates.map((candidate: { email: string }) => candidate.email);

    expect(candidateEmails).toContain(users.viewer.email);
    expect(candidateEmails).not.toContain(users.employee.email);
    expect(candidateEmails).not.toContain(users.analyticsEmployee.email);
    expect(candidateEmails).not.toContain(users.formerMember.email);
  });

  test("viewer cannot read candidates list", async ({ request }) => {
    await login(request, users.viewer);
    const response = await request.get(
      `/api/projects/${INTERNAL_PROJECT_ID}/members/candidates`,
    );
    expect(response.status()).toBe(403);
  });

  test("department admin cannot manage members of project from another department", async ({
    request,
  }) => {
    await login(request, users.departmentAdmin);
    const analyticsUserId = await getUserId(users.analyticsEmployee.email);

    const candidatesResponse = await request.get(
      `/api/projects/${ANALYTICS_PROJECT_ID}/members/candidates`,
    );
    expect(candidatesResponse.status()).toBe(403);

    const addResponse = await request.post(
      `/api/projects/${ANALYTICS_PROJECT_ID}/members`,
      { data: { userId: analyticsUserId } },
    );
    expect(addResponse.status()).toBe(403);
  });

  test("department admin can add an active user with active department membership and write activity", async ({
    request,
  }) => {
    await login(request, users.departmentAdmin);
    const targetUserId = await getUserId(users.viewer.email);

    const response = await request.post(
      `/api/projects/${INTERNAL_PROJECT_ID}/members`,
      { data: { userId: targetUserId } },
    );

    expect(response.status()).toBe(201);
    const body = await response.json();
    createdMemberIds.push(body.member.id);

    const activity = await prisma.activityLog.findFirst({
      where: {
        type: "MEMBER_ADDED",
        entityType: "ProjectMember",
        entityId: body.member.id,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, metadata: true },
    });

    expect(activity).not.toBeNull();
    if (activity) {
      createdActivityIds.push(activity.id);
      expect(activity.metadata).toMatchObject({
        projectId: INTERNAL_PROJECT_ID,
        memberId: body.member.id,
        userId: targetUserId,
      });
    }
  });

  test("rejects adding inactive user account", async ({ request }) => {
    await login(request, users.departmentAdmin);
    const targetUserId = await getUserId(users.viewer.email);

    await prisma.user.update({
      where: { id: targetUserId },
      data: { isActive: false },
    });

    try {
      const response = await request.post(
        `/api/projects/${INTERNAL_PROJECT_ID}/members`,
        { data: { userId: targetUserId } },
      );
      expect(response.status()).toBe(400);
    } finally {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { isActive: true },
      });
    }
  });

  test("rejects adding user without active membership in project department", async ({
    request,
  }) => {
    await login(request, users.departmentAdmin);
    const analyticsUserId = await getUserId(users.analyticsEmployee.email);

    const response = await request.post(
      `/api/projects/${INTERNAL_PROJECT_ID}/members`,
      { data: { userId: analyticsUserId } },
    );

    expect(response.status()).toBe(400);
  });

  test("concurrent duplicate add is handled predictably without duplicate activity", async ({
    request,
  }) => {
    await login(request, users.departmentAdmin);
    const targetUserId = await getUserId(users.viewer.email);

    await prisma.projectMember.deleteMany({
      where: {
        projectId: INTERNAL_PROJECT_ID,
        userId: targetUserId,
      },
    });

    const [first, second] = await Promise.all([
      request.post(`/api/projects/${INTERNAL_PROJECT_ID}/members`, {
        data: { userId: targetUserId },
      }),
      request.post(`/api/projects/${INTERNAL_PROJECT_ID}/members`, {
        data: { userId: targetUserId },
      }),
    ]);

    const statuses = [first.status(), second.status()].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const members = await prisma.projectMember.findMany({
      where: {
        projectId: INTERNAL_PROJECT_ID,
        userId: targetUserId,
      },
      select: { id: true },
    });

    expect(members).toHaveLength(1);
    createdMemberIds.push(members[0].id);

    const activities = await prisma.activityLog.findMany({
      where: {
        type: "MEMBER_ADDED",
        entityType: "ProjectMember",
        entityId: members[0].id,
      },
      select: { id: true },
    });

    expect(activities).toHaveLength(1);
    createdActivityIds.push(activities[0].id);
  });

  test("returns 404 when deleting memberId from another project", async ({ request }) => {
    await login(request, users.systemAdmin);

    const alienMembership = await prisma.projectMember.findFirst({
      where: { projectId: ANALYTICS_PROJECT_ID },
      select: { id: true },
    });
    expect(alienMembership).not.toBeNull();

    const response = await request.delete(
      `/api/projects/${INTERNAL_PROJECT_ID}/members/${alienMembership!.id}`,
    );
    expect(response.status()).toBe(404);
  });

  test("viewer cannot delete project members", async ({ request }) => {
    await login(request, users.viewer);

    const membership = await prisma.projectMember.findFirst({
      where: { projectId: INTERNAL_PROJECT_ID },
      select: { id: true },
    });
    expect(membership).not.toBeNull();

    const response = await request.delete(
      `/api/projects/${INTERNAL_PROJECT_ID}/members/${membership!.id}`,
    );
    expect(response.status()).toBe(403);
  });

  test("department admin can hard delete project membership and write activity in same flow", async ({
    request,
  }) => {
    await login(request, users.departmentAdmin);
    const targetUserId = await getUserId(users.viewer.email);
    await prisma.projectMember.deleteMany({
      where: {
        projectId: INTERNAL_PROJECT_ID,
        userId: targetUserId,
      },
    });

    const created = await request.post(`/api/projects/${INTERNAL_PROJECT_ID}/members`, {
      data: { userId: targetUserId },
    });
    expect(created.status()).toBe(201);
    const createdBody = await created.json();
    const memberId = createdBody.member.id as string;
    createdMemberIds.push(memberId);

    const response = await request.delete(
      `/api/projects/${INTERNAL_PROJECT_ID}/members/${memberId}`,
    );
    expect(response.status()).toBe(200);

    const deletedMember = await prisma.projectMember.findUnique({
      where: { id: memberId },
      select: { id: true },
    });
    expect(deletedMember).toBeNull();

    const activity = await prisma.activityLog.findFirst({
      where: {
        type: "MEMBER_REMOVED",
        entityType: "ProjectMember",
        entityId: memberId,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, metadata: true },
    });
    expect(activity).not.toBeNull();
    if (activity) {
      createdActivityIds.push(activity.id);
      expect(activity.metadata).toMatchObject({
        projectId: INTERNAL_PROJECT_ID,
        memberId,
        userId: targetUserId,
      });
    }

    const departmentMembership = await prisma.departmentMember.findUnique({
      where: {
        departmentId_userId: {
          departmentId: "seed-department-it",
          userId: targetUserId,
        },
      },
      select: { id: true, leftAt: true },
    });
    expect(departmentMembership).not.toBeNull();
    expect(departmentMembership?.leftAt).toBeNull();
  });

  test("project list policy remains unchanged", async ({ request }) => {
    await login(request, users.employee);

    const response = await request.get("/api/projects");
    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(
      body.projects.some(
        (project: { departmentId: string }) => project.departmentId === "seed-department-it",
      ),
    ).toBe(true);
    expect(
      body.projects.some(
        (project: { departmentId: string }) =>
          project.departmentId === "seed-department-analytics",
      ),
    ).toBe(false);
  });
});
