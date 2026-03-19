import { joinUrl } from "../utils/common";
import type { HttpRequestSpec, ProviderConfig, ResolvedRequest } from "../types";
import { BaseProviderAdapter } from "./base-adapter";

export class NovelAIOfficialAdapter extends BaseProviderAdapter {
  validateConfig(config: ProviderConfig) {
    super.validateConfig(config);
  }

  buildRequest(request: ResolvedRequest): HttpRequestSpec {
    const endpoint = request.config.style_templates?.official?.endpoint ?? "/generate";
    const body: Record<string, unknown> = {
      operation: request.operation,
      request_style: "official",
      prompt: request.prompt_bundle.final_positive_prompt,
      ...request.config.fixed_fields,
    };

    if (request.prompt_bundle.final_negative_prompt) {
      body.negative_prompt = request.prompt_bundle.final_negative_prompt;
    }

    for (const field of ["model", "width", "height", "steps", "cfg_scale", "seed", "sampler"] as const) {
      const value = request.filtered_input[field];
      if (value !== undefined) {
        body[field] = value;
      }
    }

    return {
      url: joinUrl(request.config.base_url, endpoint),
      method: "POST",
      headers: {},
      body_type: "json",
      json: body,
    };
  }

  parseResponse(response: Awaited<ReturnType<BaseProviderAdapter["sendRequest"]>>) {
    return this.parseGenericMediaResponse(response, "image");
  }
}
