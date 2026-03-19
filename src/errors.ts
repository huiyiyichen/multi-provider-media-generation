export class MediaSkillError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "MediaSkillError";
    this.code = code;
    this.details = details;
  }
}

export const toErrorPayload = (error: unknown) => {
  if (error instanceof MediaSkillError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }

  if (error instanceof Error) {
    return {
      error: {
        code: "UNEXPECTED_ERROR",
        message: error.message,
      },
    };
  }

  return {
    error: {
      code: "UNKNOWN_ERROR",
      message: "An unknown error occurred.",
      details: error,
    },
  };
};
