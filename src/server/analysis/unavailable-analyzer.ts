import { failure } from "../../shared/contracts.js";
import type {
  AnalysisInput,
  AnalysisOutput,
  Result,
} from "../../shared/contracts.js";
import type { Analyzer } from "./port.js";
export class UnavailableAnalyzer implements Analyzer {
  async analyze(
    _input: AnalysisInput,
    _signal: AbortSignal,
  ): Promise<Result<AnalysisOutput>> {
    return failure(
      "ANALYSIS_UNAVAILABLE",
      "Analysis unavailable. Use the source checklist and manual findings; your saved work remains.",
    );
  }
}
