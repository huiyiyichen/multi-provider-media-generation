import { joinUrl } from "../utils/common";
import type { HttpRequestSpec, ResolvedRequest } from "../types";
import { BaseProviderAdapter } from "./base-adapter";

const firstSource = (request: ResolvedRequest) => request.source_images[0];

export class GrokImagineAdapter extends BaseProviderAdapter {
  buildRequest(request: ResolvedRequest): HttpRequestSpec {
    const body: Record<string, unknown> = {
      model: request.model,
      ...request.config.fixed_fields,
    };

    if (request.filtered_input.prompt !== undefined) {
      body.prompt = request.filtered_input.prompt;
    }

    if (request.operation === "txt2img" && request.filtered_input.n !== undefined) {
      body.n = request.filtered_input.n;
    }

    if (request.operation === "img2img") {
      body.source_image = firstSource(request);
    }

    if (request.operation === "img2video") {
      body.source_image = firstSource(request);
    }

    return {
      url: joinUrl(request.config.base_url, "/media"),
      method: "POST",
      headers: {},
      body_type: "json",
      json: body,
    };
  }

  parseResponse(response: Awaited<ReturnType<BaseProviderAdapter["sendRequest"]>>, request: ResolvedRequest) {
    return this.parseGenericMediaResponse(response, request.operation === "img2video" ? "video" : "image");
  }
}
