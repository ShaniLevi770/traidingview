import type { Importer } from "@/lib/importers/types";
import { parseColmexCsv } from "@/lib/importers/colmex/parse";
import { groupColmexExecutions } from "@/lib/importers/colmex/group";

export const colmexImporter: Importer = {
  id: "colmex",
  displayName: "Colmex Pro",
  parseFile: parseColmexCsv,
  groupIntoTrades: groupColmexExecutions,
};
