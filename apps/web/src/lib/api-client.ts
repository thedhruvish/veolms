import axios, { type AxiosError, type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from "axios";

const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export function getApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{
      message?: string;
      code?: string;
      error?: { message?: string; code?: string };
    }>;

    const data = axiosError.response?.data;
    const status = axiosError.response?.status || 500;
    const code =
      data?.error?.code ||
      data?.code ||
      axiosError.code ||
      "UNKNOWN_ERROR";

    const message =
      data?.error?.message ||
      data?.message ||
      "Something went wrong. Please try again.";

    return { status, code, message, details: data };
  }

  if (error instanceof Error) {
    return {
      status: 500,
      code: "UNKNOWN_ERROR",
      message: error.message || "Something went wrong. Please try again.",
    };
  }

  return {
    status: 500,
    code: "UNKNOWN_ERROR",
    message: "Something went wrong. Please try again.",
  };
}

const axiosInstance: AxiosInstance = axios.create({
  baseURL: BACKEND_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error),
);

axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    if (
      response.data &&
      typeof response.data === "object" &&
      "data" in response.data &&
      "success" in response.data
    ) {
      return response.data.data;
    }
    return response.data;
  },
  (error: AxiosError) => {
    return Promise.reject(getApiError(error));
  },
);

export const api = {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return axiosInstance.get(url, config) as unknown as Promise<T>;
  },

  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return axiosInstance.post(url, data, config) as unknown as Promise<T>;
  },

  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return axiosInstance.put(url, data, config) as unknown as Promise<T>;
  },

  patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return axiosInstance.patch(url, data, config) as unknown as Promise<T>;
  },

  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return axiosInstance.delete(url, config) as unknown as Promise<T>;
  },
};

export default api;
