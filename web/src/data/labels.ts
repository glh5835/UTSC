/**
 * Display labels for shared contract enum values, in English and Chinese.
 *
 * Canonical IDs (role_id, skill_id, enum values) are never replaced by
 * translations: the UI always keeps the canonical value available (shown as
 * the value itself when no translation exists, and as code-style text next to
 * translated labels where it matters). This satisfies the project rule that
 * UI language changes must retain canonical enum values and filters.
 *
 * Coverage of these maps against the upstream schema enums is asserted in
 * tests/labels.test.ts, so a new enum value upstream fails the check instead
 * of silently rendering as an untranslated raw id.
 */

import type { Lang } from '../i18n/lang'

export interface BilingualLabel {
  en: string
  zh: string
}

export function labelFor(map: Record<string, BilingualLabel>, value: string, lang: Lang): string {
  const entry = map[value]
  if (!entry) return value
  return lang === 'zh' ? entry.zh : entry.en
}

export const ROLE_LABELS: Record<string, BilingualLabel> = {
  data_analyst: { en: 'Data Analyst', zh: '数据分析师' },
  business_analyst: { en: 'Business Analyst', zh: '业务分析师' },
  bi_analyst: { en: 'BI / Reporting Analyst', zh: 'BI／报表分析师' },
  data_scientist: { en: 'Data Scientist', zh: '数据科学家' },
  data_engineer: { en: 'Data Engineer', zh: '数据工程师' },
  product_analyst: { en: 'Product Analyst', zh: '产品分析师' },
  operations_analyst: { en: 'Operations Analyst', zh: '运营分析师' },
  financial_risk_analyst: { en: 'Financial / Risk Analyst', zh: '金融／风险分析师' },
}

export const ROLE_SUBTYPE_LABELS: Record<string, BilingualLabel> = {
  financial_analysis: { en: 'Financial analysis', zh: '金融分析' },
  risk_analysis: { en: 'Risk analysis', zh: '风险分析' },
}

export const ROLE_CLASSIFICATION_STATUS_LABELS: Record<string, BilingualLabel> = {
  classified: { en: 'Classified', zh: '已分类' },
  needs_review: { en: 'Needs review', zh: '待复核' },
  outside_scope: { en: 'Outside scope', zh: '范围外' },
}

export const CAREER_LEVEL_LABELS: Record<string, BilingualLabel> = {
  internship: { en: 'Internship', zh: '实习' },
  new_grad: { en: 'New grad', zh: '应届毕业生' },
  entry_level: { en: 'Entry level', zh: '初级入门' },
  unknown: { en: 'Unknown', zh: '未知' },
  potential_senior: { en: 'Potential senior (review)', zh: '可能偏资深（待复核）' },
}

export const MARKET_AREA_LABELS: Record<string, BilingualLabel> = {
  toronto_gta: { en: 'Toronto / GTA', zh: '多伦多／大多伦多地区' },
  montreal_metro: { en: 'Montreal metro', zh: '蒙特利尔都会区' },
  other_canada: { en: 'Other Canada', zh: '加拿大其他地区' },
  unknown: { en: 'Unknown', zh: '未知' },
}

export const DATE_PRECISION_LABELS: Record<string, BilingualLabel> = {
  datetime: { en: 'Exact time (UTC)', zh: '精确时间（UTC）' },
  date: { en: 'Date only', zh: '仅日期' },
  unknown: { en: 'Unknown date', zh: '日期未知' },
}

export const DESCRIPTION_STATUS_LABELS: Record<string, BilingualLabel> = {
  available: { en: 'Description available', zh: '有职位描述' },
  missing: { en: 'Description missing', zh: '缺少职位描述' },
  unavailable: { en: 'Description unavailable', zh: '描述不可用' },
}

export const OPPORTUNITY_KIND_LABELS: Record<string, BilingualLabel> = {
  event: { en: 'Event', zh: '活动' },
  ongoing_opportunity: { en: 'Ongoing opportunity', zh: '持续机会' },
}

export const ACTIVITY_TYPE_LABELS: Record<string, BilingualLabel> = {
  workshop: { en: 'Workshop', zh: '工作坊' },
  competition: { en: 'Competition', zh: '竞赛' },
  talk: { en: 'Talk', zh: '讲座' },
  networking: { en: 'Networking', zh: '社交联谊' },
  social: { en: 'Social', zh: '社交活动' },
  recruitment: { en: 'Recruitment', zh: '招募' },
  volunteering: { en: 'Volunteering', zh: '志愿服务' },
  research: { en: 'Research', zh: '研究' },
  other: { en: 'Other', zh: '其他' },
}

export const TOPIC_LABELS: Record<string, BilingualLabel> = {
  data_ai: { en: 'Data & AI', zh: '数据与 AI' },
  software: { en: 'Software', zh: '软件' },
  finance: { en: 'Finance', zh: '金融' },
  business: { en: 'Business', zh: '商业' },
  arts_culture: { en: 'Arts & culture', zh: '艺术与文化' },
  community: { en: 'Community', zh: '社区' },
  other: { en: 'Other', zh: '其他' },
}

export const BEGINNER_LEVEL_LABELS: Record<string, BilingualLabel> = {
  beginner_friendly: { en: 'Beginner friendly', zh: '适合新手' },
  prerequisites_required: { en: 'Prerequisites required', zh: '需要先修条件' },
  unknown: { en: 'Unknown', zh: '未知' },
}

export const FORMAT_LABELS: Record<string, BilingualLabel> = {
  online: { en: 'Online', zh: '线上' },
  in_person: { en: 'In person', zh: '线下' },
  hybrid: { en: 'Hybrid', zh: '混合' },
  unknown: { en: 'Unknown', zh: '未知' },
}

export const REVIEW_STATUS_LABELS: Record<string, BilingualLabel> = {
  draft: { en: 'Draft', zh: '草稿' },
  needs_review: { en: 'Needs review', zh: '待复核' },
  approved: { en: 'Approved', zh: '已批准' },
  rejected: { en: 'Rejected', zh: '已拒绝' },
  archived: { en: 'Archived', zh: '已归档' },
}

export const RESOURCE_TYPE_LABELS: Record<string, BilingualLabel> = {
  course: { en: 'Course', zh: '课程' },
  tutorial: { en: 'Tutorial', zh: '教程' },
  project: { en: 'Project', zh: '项目' },
  competition: { en: 'Competition', zh: '竞赛' },
  club: { en: 'Club', zh: '社团' },
  event: { en: 'Event', zh: '活动' },
  documentation: { en: 'Documentation', zh: '文档' },
  other: { en: 'Other', zh: '其他' },
}

export const LEVEL_LABELS: Record<string, BilingualLabel> = {
  beginner: { en: 'Beginner', zh: '入门' },
  intermediate: { en: 'Intermediate', zh: '进阶' },
  advanced: { en: 'Advanced', zh: '高级' },
  unknown: { en: 'Unknown', zh: '未知' },
}

export const RUN_STATUS_LABELS: Record<string, BilingualLabel> = {
  complete: { en: 'Complete', zh: '完整' },
  partial: { en: 'Partial', zh: '部分' },
}

export const SKILL_CATEGORY_LABELS: Record<string, BilingualLabel> = {
  technical: { en: 'Technical', zh: '技术技能' },
  soft: { en: 'Soft', zh: '软技能' },
}
