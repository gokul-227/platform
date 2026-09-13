import { projectScopeQuerySchema } from "@aec-craft/platform-contracts";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/** Extraction is project-scoped throughout: an org has no model to ground in. */
export class ProjectScopeQueryDto extends createZodDto(
  projectScopeQuerySchema
) {}

/**
 * The text is not passed in: files-api already holds it, so a run names the file
 * and this package never learns what a bucket is.
 */
export class StartRuleExtractionDto extends createZodDto(
  z.object({
    fileId: z
      .string()
      .uuid()
      .describe("The document to read, as it exists in the files API."),
  })
) {}
