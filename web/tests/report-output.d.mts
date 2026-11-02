export function parseOutputArgument(args: string[], options?: { required?: boolean }): string | null
export function reserveReportOutput(args: string[], options?: { root?: string; now?: Date }): {
  file: string
  write(report: unknown): void
}
