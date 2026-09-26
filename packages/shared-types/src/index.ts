export * from './user';
export * from './task';
export * from './course';
export * from './attendance';
export * from './calendar';
export * from './pomodoro';
export * from './day';
export * from './review';
export * from './api';

export interface ApiResponse<T> {
  data: T;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type ID = string;