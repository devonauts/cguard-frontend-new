import type { EnrollmentStatus } from "@/lib/api/trainingCourseService";

import api from "@/lib/api";

export interface EnrollInput {
  securityGuardId?: string;
  assignmentType: "individual" | "all_guards";
  dueDate?: string;
}

export interface EnrollmentRow {
  id: string;
  guardId?: string | null;
  guardName?: string;
  assignmentType: "individual" | "all_guards";
  status: EnrollmentStatus;
  progressPercentage: number;
  quizPassed?: boolean;
  quizScore?: number | null;
  completedAt?: string | null;
  dueDate?: string | null;
}

export interface EnrollmentListResponse {
  rows: EnrollmentRow[];
  count: number;
}

export interface LessonCompletionRow {
  lessonId: string;
  title: string;
  completedAt?: string | null;
}

export interface EnrollmentDetail {
  id: string;
  courseId: string;
  guardName: string;
  status: EnrollmentStatus;
  progressPercentage: number;
  quizPassed: boolean;
  quizScore?: number | null;
  lessonCompletions: LessonCompletionRow[];
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  status?: EnrollmentStatus;
}

let globalTenantId: string | null = null;

export const setTrainingEnrollmentTenantId = (id: string) => {
  globalTenantId = id;
};

const getTenantId = (): string => {
  if (globalTenantId) return globalTenantId;
  const local = localStorage.getItem("tenantId");

  if (local) return local;
  throw new Error(
    "El usuario debe estar vinculado a una empresa para continuar.",
  );
};

const base = () => `/tenant/${getTenantId()}/training`;

export const trainingEnrollmentService = {
  async enroll(courseId: string, input: EnrollInput) {
    const { data } = await api.post(`${base()}/courses/${courseId}/enroll`, {
      data: input,
    });

    return data;
  },

  async listByCourse(
    courseId: string,
    options: ListOptions = { limit: 25, offset: 0 },
  ): Promise<EnrollmentListResponse> {
    const params = new URLSearchParams();

    if (options.limit !== undefined)
      params.append("limit", String(options.limit));
    if (options.offset !== undefined)
      params.append("offset", String(options.offset));
    if (options.status) params.append("status", options.status);
    const { data } = await api.get(
      `${base()}/courses/${courseId}/enrollments?${params.toString()}`,
      {
        toast: { silentError: true },
      },
    );

    return { rows: data.rows ?? [], count: data.count ?? 0 };
  },

  async detail(enrollmentId: string): Promise<EnrollmentDetail> {
    const { data } = await api.get(`${base()}/enrollments/${enrollmentId}`, {
      toast: { silentError: true },
    });

    return data;
  },
};
