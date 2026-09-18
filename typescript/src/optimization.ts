/** Provider-neutral optimization capability shared by GEPA, DSPy, and future adapters. */

export const OPTIMIZE_REQUEST_SCHEMA = "hsm.optimizer.optimize_request.v1" as const;
export const OPTIMIZE_RESPONSE_SCHEMA = "hsm.optimizer.optimize_response.v1" as const;
export const OPTIMIZATION_RECEIPT_SCHEMA = "hsm.optimizer.receipt.v1" as const;

export type OptimizerJsonValue =
  | string
  | number
  | boolean
  | null
  | OptimizerJsonValue[]
  | { [key: string]: OptimizerJsonValue };

export type OptimizationArtifact = {
  id: string;
  kind: string;
  content: OptimizerJsonValue;
  mediaType?: string;
  source?: string;
  provenance?: OptimizerJsonValue;
};

export type ObjectiveDimension = {
  id: string;
  description: string;
  direction?: "maximize" | "minimize";
  weight?: number;
};

export type OptimizeRequest = {
  schema: typeof OPTIMIZE_REQUEST_SCHEMA;
  artifact: OptimizationArtifact;
  objective: {
    description: string;
    dimensions: ObjectiveDimension[];
  };
  evaluator: {
    id: string;
    version: string;
    kind: string;
    metrics: Array<{
      objectiveId: string;
      adapter: string;
      config?: OptimizerJsonValue;
    }>;
    config?: OptimizerJsonValue;
  };
  constraints?: {
    maxIterations?: number;
    populationSize?: number;
    maxCandidates?: number;
    timeoutMs?: number;
    maxCostMicrounits?: number;
    allowExternalNetwork?: boolean;
    mutationOperators?: string[];
    promotionPolicy?: "none" | "proposal_only" | "require_approval";
  };
  metadata?: OptimizerJsonValue;
};

export type OptimizationScore = {
  objectiveId: string;
  value: number;
  evidence?: OptimizerJsonValue;
};

export type OptimizationCandidate = {
  id: string;
  rank: number;
  artifact: OptimizationArtifact;
  scores: OptimizationScore[];
  aggregateScore?: number;
  constraintsSatisfied: boolean;
  feedback: string[];
};

export type OptimizationReceipt = {
  schema: typeof OPTIMIZATION_RECEIPT_SCHEMA;
  id: string;
  kind: string;
  status: "recorded" | "verified" | "failed";
  candidateId?: string;
  requestDigest?: string;
  outputDigest?: string;
  evidence?: OptimizerJsonValue;
};

export type OptimizeResponse = {
  schema: typeof OPTIMIZE_RESPONSE_SCHEMA;
  optimizer: {
    id: string;
    version: string;
    strategy: string;
  };
  candidates: OptimizationCandidate[];
  paretoFront: string[];
  lineage: Array<{
    candidateId: string;
    generation: number;
    parentIds: string[];
    operation: string;
    actionableSideInformation?: OptimizerJsonValue;
  }>;
  receipts: OptimizationReceipt[];
  recommendation?: {
    decision: "propose" | "no_improvement" | "manual_review";
    candidateId?: string;
    rationale: string;
  };
  terminalOutcome: "success" | "no_improvement" | "failed" | "cancelled";
};
