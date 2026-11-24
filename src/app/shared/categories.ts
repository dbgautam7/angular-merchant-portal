import { Pipe, PipeTransform } from '@angular/core';

/** Merchant categories: API value → label. */
export const CATEGORY_LABELS: Record<string, string> = {
  RETAIL: 'Retail',
  TRAVEL: 'Travel',
  FOOD: 'Food & beverage',
  DIGITAL: 'Digital goods',
};

/** `{{ 'FOOD' | categoryLabel }}` → "Food & beverage". Unknown values are shown as they are. */
@Pipe({ name: 'categoryLabel' })
export class CategoryLabelPipe implements PipeTransform {
  transform(value: string): string {
    return CATEGORY_LABELS[value] ?? value;
  }
}
