export class NotFoundError extends Error {
  readonly code = 'ENOENT';
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
