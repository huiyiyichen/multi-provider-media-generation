import { MediaSkillError } from "../errors";
import { joinUrl } from "../utils/common";
import type { HttpRequestSpec, ProviderConfig, ResolvedRequest } from "../types";
import { BaseProviderAdapter } from "./base-adapter";

export class NovelAICompatibleAdapter extends BaseProviderAdapter {
  validateConfig(config: ProviderConfig) {
    super.validateConfig(config);

    if (!config.request_style || !config.style_templates?.[config.request_style]) {
      throw new MediaSkillError(
        "STYLE_TEMPLATE_REQUIRED",
        "novelai_compatible requires a request_style with a matching style_templates entry.",
      );
    }
  }

  buildRequest(request: ResolvedRequest): HttpRequestSpec {
    const requestStyle = request.request_style;
    if (!requestStyle) {
      throw new MediaSkillError("REQUEST_STYLE_REQUIRED", "novelai_compatible requires request_style.");
    }

    const template = request.config.style_templates?.[requestStyle];
    if (!template) {
      throw new MediaSkillError(
        "STYLE_TEMPLATE_REQUIRED",
        `novelai_compatible requires style_templates.${requestStyle}.`,
      );
    }

    const prompt = request.prompt_bundle.final_positive_prompt;
    const negativePrompt = request.prompt_bundle.final_negative_prompt;
    let body: Record<string, unknown>;

    if (requestStyle === "oai_images") {
      body = {
        ...request.config.fixed_fields,
        ...template.extra_body,
        prompt,
      };
      if (negativePrompt) {
        body.negative_prompt = negativePrompt;
      }
      for (const field of ["model", "size", "n", "response_format"] as const) {
        const value = request.filtered_input[field];
        if (value !== undefined) {
          body[field] = value;
        }
      }
    } else if (requestStyle === "nai_compatible") {
      body = {
        ...request.config.fixed_fields,
        ...template.extra_body,
        stream: false,
        messages: [{ role: "user", content: prompt }],
      };

      if (negativePrompt) {
        body.negative_prompt = negativePrompt;
      }

      const model = request.filtered_input.model;
      if (model !== undefined) {
        body.model = model;
      }

      const size = request.filtered_input.size;
      if (size !== undefined) {
        body.size = size;
        body.image_size = size;
      }

      for (const field of ["width", "height", "steps", "seed", "sampler"] as const) {
        const value = request.filtered_input[field];
        if (value !== undefined) {
          body[field] = value;
        }
      }

      if (request.filtered_input.cfg_scale !== undefined) {
        body.scale = request.filtered_input.cfg_scale;
      }
    } else if (requestStyle === "wrapped") {
      const wrapped: Record<string, unknown> = {
        prompt,
      };
      if (negativePrompt) {
        wrapped.negative_prompt = negativePrompt;
      }
      for (const field of ["model", "width", "height", "steps", "cfg_scale", "seed", "sampler", "n", "response_format"] as const) {
        const value = request.filtered_input[field];
        if (value !== undefined) {
          wrapped[field] = value;
        }
      }
      body = {
        request_style: requestStyle,
        input: wrapped,
        ...request.config.fixed_fields,
        ...template.extra_body,
      };
    } else {
      body = {
        ...request.config.fixed_fields,
        ...template.extra_body,
        prompt,
      };
      if (negativePrompt) {
        body.negative_prompt = negativePrompt;
      }
      for (const field of ["model", "width", "height", "steps", "cfg_scale", "seed", "sampler", "n", "response_format"] as const) {
        const value = request.filtered_input[field];
        if (value !== undefined) {
          body[field] = value;
        }
      }
    }

    return {
      url: joinUrl(request.config.base_url, template.endpoint),
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
