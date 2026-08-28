export type DomainError = Readonly<{
  code: string;
  event: string;
  from: string;
}>;

export type Result<T, E> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ error: E; ok: false }>;
