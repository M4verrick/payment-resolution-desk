import type {
  AnalysisInput,
  AnalysisOutput,
  Result,
} from "../../shared/contracts.js";
export interface Analyzer {
  readonly mode?: "mock" | "model";
  readonly revision?: string;
  analyze(
    input: AnalysisInput,
    signal: AbortSignal,
  ): Promise<Result<AnalysisOutput>>;
}
