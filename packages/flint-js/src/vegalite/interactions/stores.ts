/** The fields a compiled mark's rows carry for interaction: identity, role, and a legend entry's channel and field. */
export const INTERACTION_KEY = '__flint_interaction_key';
export const INTERACTION_ROLE = '__flint_interaction_role';
export const INTERACTION_LEGEND_CHANNEL = '__flint_legend_channel';
export const INTERACTION_LEGEND_FIELD = '__flint_legend_field';

export const INTERACTION_STORE = '__flint_interaction_store';
export const HOVER_STORE = '__flint_hover_store';
export const HIDDEN_STORE = '__flint_hidden_store';
export const LEGEND_HIDDEN_STORE = '__flint_legend_hidden_store';
export const LEGEND_HOVER_STORE = '__flint_legend_hover_store';
export const AXIS_HOVER_STORE = '__flint_axis_hover_store';
export const LEGEND_SELECTION_STORE = '__flint_legend_selection_store';
export const STYLE_SIGNAL = '__flint_style_by_key';
/** The opacity the marks outside an emphasis recede to, set each render from the emphasis level. */
export const DIM_SIGNAL = '__flint_dim_opacity';
/** Whether DIM_SIGNAL scales each mark's own opacity (an emphasis level) or replaces it (a stated `mutedOpacity`). */
export const DIM_RELATIVE_SIGNAL = '__flint_dim_relative';

export const INTERACTION_STORES: readonly string[] = [
    INTERACTION_STORE,
    HOVER_STORE,
    HIDDEN_STORE,
    LEGEND_HIDDEN_STORE,
    LEGEND_HOVER_STORE,
    AXIS_HOVER_STORE,
    LEGEND_SELECTION_STORE,
];