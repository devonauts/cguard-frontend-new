import api from "@/lib/api";

export type TrainingCategory =
  | "security"
  | "compliance"
  | "skills"
  | "safety"
  | "other";
export type TrainingLevel = "beginner" | "intermediate" | "advanced";
export type EnrollmentStatus =
  | "assigned"
  | "in_progress"
  | "completed"
  | "expired";

export interface TrainingResource {
  name: string;
  url: string;
  type?: string;
}

export interface TrainingLesson {
  id: string;
  courseId: string;
  order: number;
  title: string;
  description?: string;
  videoUrl?: string;
  richContent?: string;
  resources?: TrainingResource[] | null;
  durationMinutes?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TrainingQuizSummary {
  id: string;
  bankId: string;
  passPct: number;
  /** Cuántas preguntas se sortean por intento. Lo devuelve el backend desde
   *  2026-08-13; antes el formulario no podía hidratarlo y lo pisaba con 5. */
  questionsPerAttempt?: number;
}

export interface TrainingCourse {
  id: string;
  title: string;
  description?: string;
  coverUrl?: string;
  category?: TrainingCategory;
  level?: TrainingLevel;
  pointsValue: number;
  passingScore?: number;
  isAddon?: boolean;
  addonPrice?: number | string | null;
  certificateTemplate?: string;
  published?: boolean;
  tenantId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lessons?: TrainingLesson[];
  quiz?: TrainingQuizSummary | null;
}

export interface TrainingCourseInput {
  title: string;
  description?: string;
  coverUrl?: string;
  category?: TrainingCategory;
  level?: TrainingLevel;
  pointsValue?: number;
  passingScore?: number;
  certificateTemplate?: string;
  published?: boolean;
}

export interface TrainingLessonInput {
  order?: number;
  title: string;
  description?: string;
  videoUrl?: string;
  richContent?: string;
  resources?: TrainingResource[];
  durationMinutes?: number;
}

export interface QuizQuestionInput {
  prompt: string;
  options: string[];
  correctIndex: number;
}

export interface TrainingQuizInput {
  questionsPerAttempt?: number;
  passPct?: number;
  questions?: QuizQuestionInput[];
}

export interface CourseListFilters {
  category?: TrainingCategory;
  published?: boolean;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
}

export interface CourseListResponse {
  rows: TrainingCourse[];
  count: number;
}

let globalTenantId: string | null = null;

export const setTrainingTenantId = (id: string) => {
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

export const trainingCourseService = {
  async list(
    filters: CourseListFilters = {},
    options: ListOptions = { limit: 25, offset: 0 },
  ): Promise<CourseListResponse> {
    const params = new URLSearchParams();

    if (filters.category) params.append("category", filters.category);
    if (typeof filters.published === "boolean")
      params.append("published", String(filters.published));
    if (options.limit !== undefined)
      params.append("limit", String(options.limit));
    if (options.offset !== undefined)
      params.append("offset", String(options.offset));
    const { data } = await api.get(`${base()}/courses?${params.toString()}`, {
      toast: { silentError: true },
    });

    return { rows: data.rows ?? [], count: data.count ?? 0 };
  },

  async get(id: string): Promise<TrainingCourse> {
    const { data } = await api.get(`${base()}/courses/${id}`, {
      toast: { silentError: true },
    });

    return data;
  },

  async create(input: TrainingCourseInput): Promise<TrainingCourse> {
    const { data } = await api.post(`${base()}/courses`, { data: input });

    return data;
  },

  async update(
    id: string,
    input: Partial<TrainingCourseInput>,
  ): Promise<TrainingCourse> {
    const { data } = await api.put(`${base()}/courses/${id}`, { data: input });

    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`${base()}/courses/${id}`);
  },

  // ---- Lessons ----
  async listLessons(courseId: string): Promise<TrainingLesson[]> {
    const { data } = await api.get(`${base()}/courses/${courseId}/lessons`, {
      toast: { silentError: true },
    });

    return data.rows ?? [];
  },

  async createLesson(
    courseId: string,
    input: TrainingLessonInput,
  ): Promise<TrainingLesson> {
    const { data } = await api.post(`${base()}/courses/${courseId}/lessons`, {
      data: input,
    });

    return data;
  },

  async updateLesson(
    lessonId: string,
    input: Partial<TrainingLessonInput>,
  ): Promise<TrainingLesson> {
    const { data } = await api.put(`${base()}/lessons/${lessonId}`, {
      data: input,
    });

    return data;
  },

  async removeLesson(lessonId: string): Promise<void> {
    await api.delete(`${base()}/lessons/${lessonId}`);
  },

  // ---- Quiz ----
  async saveQuiz(
    courseId: string,
    input: TrainingQuizInput,
  ): Promise<{ id: string; bankId: string; courseName: string }> {
    const { data } = await api.post(`${base()}/courses/${courseId}/quiz`, {
      data: input,
    });

    return data;
  },
};
