import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config';
import {
  ApplicationDto,
  ApplicationForm,
  ApplicationQuery,
  ApplicationSummary,
  Page,
  User,
} from '../models';

/**
 * Typed client for the applications API: one method per endpoint. Every application comes
 * back as an ApplicationDto, carrying the actions the current user may take on it.
 */
@Injectable({ providedIn: 'root' })
export class ApplicationApi {
  private readonly http = inject(HttpClient);
  private readonly apiBase = inject(API_BASE_URL);
  private readonly base = `${this.apiBase}/applications`;

  list(q: ApplicationQuery): Observable<Page<ApplicationDto>> {
    const params = new HttpParams({
      fromObject: { page: q.page, size: q.size, status: q.status, q: q.q },
    });
    return this.http.get<Page<ApplicationDto>>(this.base, { params });
  }
  /** Counts per status, scoped like the list; drives the dashboard's status tabs. */
  summary(q: string): Observable<ApplicationSummary> {
    return this.http.get<ApplicationSummary>(`${this.base}/summary`, { params: { q } });
  }
  get(id: string) {
    return this.http.get<ApplicationDto>(`${this.base}/${id}`);
  }
  createDraft() {
    return this.http.post<ApplicationDto>(this.base, {});
  }
  saveDraft(id: string, form: ApplicationForm) {
    return this.http.put<ApplicationDto>(`${this.base}/${id}`, form);
  }
  submit(id: string) {
    return this.http.post<ApplicationDto>(`${this.base}/${id}/submit`, {});
  }
  decide(id: string, decision: 'APPROVED' | 'REJECTED', comment: string) {
    return this.http.post<ApplicationDto>(`${this.base}/${id}/decision`, {
      decision,
      comment,
    });
  }
  assign(id: string, reviewerId: string) {
    return this.http.put<ApplicationDto>(`${this.base}/${id}/assign`, { reviewerId });
  }
  /** The full value; the server allows it only with the 'reveal' action, and audits it. */
  reveal(id: string, field: 'taxId' | 'accountNumber') {
    return this.http.get<{ value: string }>(`${this.base}/${id}/reveal/${field}`);
  }
  reviewers() {
    return this.http.get<User[]>(`${this.apiBase}/users/reviewers`);
  }
}
