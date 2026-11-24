import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ApplicationForm,
  ApplicationQuery,
  ApplicationSummary,
  MerchantApplication,
  Page,
  User,
} from '../models';

@Injectable({ providedIn: 'root' })
export class ApplicationApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/applications';

  list(q: ApplicationQuery): Observable<Page<MerchantApplication>> {
    const params = new HttpParams({
      fromObject: { page: q.page, size: q.size, status: q.status, q: q.q },
    });
    return this.http.get<Page<MerchantApplication>>(this.base, { params });
  }
  /** Counts per status, scoped like the list; drives the dashboard's status tabs. */
  summary(q: string): Observable<ApplicationSummary> {
    return this.http.get<ApplicationSummary>(`${this.base}/summary`, { params: { q } });
  }
  get(id: string) {
    return this.http.get<MerchantApplication>(`${this.base}/${id}`);
  }
  createDraft() {
    return this.http.post<MerchantApplication>(this.base, {});
  }
  saveDraft(id: string, form: ApplicationForm) {
    return this.http.put<MerchantApplication>(`${this.base}/${id}`, form);
  }
  submit(id: string) {
    return this.http.post<MerchantApplication>(`${this.base}/${id}/submit`, {});
  }
  decide(id: string, decision: 'APPROVED' | 'REJECTED', comment: string) {
    return this.http.post<MerchantApplication>(`${this.base}/${id}/decision`, {
      decision,
      comment,
    });
  }
  assign(id: string, reviewerId: string) {
    return this.http.put<MerchantApplication>(`${this.base}/${id}/assign`, { reviewerId });
  }
  /** Server returns the unmasked value only to permitted roles. */
  reveal(id: string, field: 'taxId' | 'accountNumber') {
    return this.http.get<{ value: string }>(`${this.base}/${id}/reveal/${field}`);
  }
  reviewers() {
    return this.http.get<User[]>('/api/users/reviewers');
  }
}
