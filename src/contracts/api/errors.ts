export type ApiError = Readonly<{
  code: string;
  requestId: string;
  status: number;
}>;
