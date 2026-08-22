export interface SmartPriorityWeights {
  w1_damage_severity: number;
  w2_support: number;
  w3_density: number;
  w4_category: number;
  density_radius_meters: number;
  support_cap: number;
}

export interface SmartPriorityComponents {
  damage_severity_raw: number;
  damage_severity_weighted: number;
  support_count_raw: number;
  support_normalized: number;
  support_weighted: number;
  location_density_raw: number;
  location_density_factor: number;
  location_density_weighted: number;
  category_urgency_weight_raw: number;
  category_urgency_weighted: number;
}

export interface SmartPriorityScoreResult {
  urgency_score: number;
  components: SmartPriorityComponents;
}
