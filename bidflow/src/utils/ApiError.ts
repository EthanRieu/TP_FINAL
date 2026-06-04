export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
