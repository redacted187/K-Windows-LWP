// Module / property schema mirroring the KLWP editor's tabs and labels.
(function (G) {
  'use strict';
  const N = (k, l, d, x) => Object.assign({ k, l, t: 'num', d }, x || {});
  const L = G.KLabels || { opt: {}, ed: {} };
  // option lists come from KLWP's own resources so every stored value the app knows is offered, with its real label
  const O = (type, first) => {
    const all = Object.keys(L.opt[type] || {}).sort();
    const out = (first || []).slice();
    all.forEach(v => {
      if (out.indexOf(v) < 0) out.push(v);
    });
    out.en = type;
    return out;
  };
  const E = (k, l, o, d, x) => Object.assign({ k, l, t: 'enum', o, d: d === undefined ? o[0] : d, en: o.en }, x || {});
  const C = (k, l, d, x) => Object.assign({ k, l, t: 'color', d: d || '#FFFFFFFF' }, x || {});
  const T = (k, l, x) => Object.assign({ k, l, t: 'text', d: '' }, x || {});
  const is =
    (k, ...vals) =>
    g =>
      vals.indexOf(g(k)) >= 0;
  const not =
    (k, ...vals) =>
    g =>
      vals.indexOf(g(k)) < 0;

  const ANCHORS = O('anchormode', [
    'CENTER',
    'TOPLEFT',
    'TOP',
    'TOPRIGHT',
    'CENTERLEFT',
    'CENTERRIGHT',
    'BOTTOMLEFT',
    'BOTTOM',
    'BOTTOMRIGHT'
  ]);
  const ROT = O('rotate', ['NONE', 'MANUAL', 'DEG90', 'DEG180', 'DEG270', 'FLIP_X', 'FLIP_Y']);
  const BLEND = [
    'NORMAL',
    'SRC',
    'XOR',
    'CLEAR',
    'DARKEN',
    'LIGHTEN',
    'MULTIPLY',
    'SCREEN',
    'ADD',
    'OVERLAY',
    'DIFFERENCE'
  ];
  const BFILTER = [
    'NONE',
    'DESATURATE',
    'BW',
    'SEPIA',
    'BRIGHTEN',
    'DARKEN',
    'CONTRAST',
    'SATURATE',
    'HUE',
    'INVERT',
    'COLORIZE'
  ];
  const VISIBLE = O('visiblemode', ['ALWAYS', 'NEVER', 'REMOVE']);

  const POSITION = [
    E('position_anchor', 'Anchor', ANCHORS, 'CENTER', { noStack: true, rootDefault: 'TOP' }),
    N('position_offset_x', 'X Offset', 0, { noStack: true }),
    N('position_offset_y', 'Y Offset', 0, { noStack: true }),
    N('position_padding_left', 'Padding Left', 0, { min: 0 }),
    N('position_padding_top', 'Padding Top', 0, { min: 0 }),
    N('position_padding_right', 'Padding Right', 0, { min: 0 }),
    N('position_padding_bottom', 'Padding Bottom', 0, { min: 0 })
  ];
  const PAINT = [
    E('paint_style', 'Style', ['FILL', 'STROKE']),
    N('paint_stroke', 'Stroke width', 5, { min: 0, show: is('paint_style', 'STROKE') }),
    C('paint_color', 'Color'),
    E('paint_mode', 'Paint mode', BLEND)
  ];
  // "Background" / "Blurred background" masks replace the item's own paint: KLWP hides Texture and Shadow for them and offers Filter, Dim (and Blur) instead
  const bgm = g => g('fx_mask') === 'BACKGROUND' || g('fx_mask') === 'BLURRED';
  const nobg = list =>
    list.map(o =>
      /^fx_bitmap_/.test(o.k)
        ? o
        : Object.assign({}, o, {
            show: o.show
              ? (
                  sh => g =>
                    !bgm(g) && sh(g)
                )(o.show)
              : g => !bgm(g)
          })
    );
  const GRAD = [
    E('fx_gradient', 'Texture', O('gradient', ['NONE', 'HORIZONTAL', 'VERTICAL', 'RADIAL', 'SWEEP', 'BITMAP'])),
    C('fx_gradient_color', 'Gradient color', '#FF000000', {
      show: is('fx_gradient', 'HORIZONTAL', 'VERTICAL', 'RADIAL', 'SWEEP')
    }),
    N('fx_gradient_width', 'Gradient width', 100, {
      min: 0,
      max: 100,
      show: is('fx_gradient', 'HORIZONTAL', 'VERTICAL', 'RADIAL')
    }),
    N('fx_gradient_offset', 'Gradient offset', 50, {
      min: 0,
      max: 100,
      show: is('fx_gradient', 'HORIZONTAL', 'VERTICAL', 'RADIAL')
    }),
    N('fx_gradient_offset_x', 'Center X', 0, { show: is('fx_gradient', 'RADIAL', 'SWEEP') }),
    N('fx_gradient_offset_y', 'Center Y', 0, { show: is('fx_gradient', 'RADIAL', 'SWEEP') }),
    { k: 'fx_gradient_bitmap', l: 'Bitmap', t: 'bitmap', d: '', show: is('fx_gradient', 'BITMAP') },
    N('fx_gradient_bitmap_width', 'Bitmap width', 0, { min: 0, show: is('fx_gradient', 'BITMAP') }),
    E('fx_gradient_bitmap_mode', 'Bitmap mode', O('bitmaptilemode', ['FIT_CENTER', 'REPEAT', 'MIRROR']), 'FIT_CENTER', {
      show: is('fx_gradient', 'BITMAP')
    }),
    E('fx_bitmap_filter', 'Filter', BFILTER, 'NONE', { show: g => bgm(g) || g('fx_gradient') === 'BITMAP' }),
    N('fx_bitmap_filter_amount', 'Filter amount', 100, {
      min: 0,
      max: 100,
      show: g =>
        (bgm(g) || g('fx_gradient') === 'BITMAP') &&
        ['NONE', 'BW', 'INVERT', 'COLORIZE'].indexOf(g('fx_bitmap_filter')) < 0
    }),
    C('fx_bitmap_filter_color', 'Filter color', '#FFFFFFFF', {
      show: g => (bgm(g) || g('fx_gradient') === 'BITMAP') && g('fx_bitmap_filter') === 'COLORIZE'
    }),
    N('fx_bitmap_dim', 'Dim', 0, { min: 0, max: 100, show: g => bgm(g) || g('fx_gradient') === 'BITMAP' }),
    N('fx_bitmap_blur', 'Blur', 0, {
      min: 0,
      show: g => g('fx_mask') === 'BLURRED' || (!bgm(g) && g('fx_gradient') === 'BITMAP')
    })
  ];
  const SHADOW = [
    E('fx_shadow', 'Shadow', O('shadow', ['NONE', 'OUTER'])),
    N('fx_shadow_blur', 'Shadow blur', 5, { min: 0, show: not('fx_shadow', 'NONE') }),
    N('fx_shadow_direction', 'Shadow direction', 0, { min: 0, max: 360, show: not('fx_shadow', 'NONE') }),
    N('fx_shadow_distance', 'Shadow distance', 0, { min: 0, show: not('fx_shadow', 'NONE') }),
    C('fx_shadow_color', 'Shadow color', '#FF000000', { show: not('fx_shadow', 'NONE') })
  ];
  const FX = [E('fx_mask', 'Mask', O('maskfilter', ['NONE', 'BACKGROUND', 'BLURRED', 'CLIP_NEXT', 'CLIP_ALL']))].concat(
    nobg(GRAD),
    nobg(SHADOW).map(o => Object.assign(o, { noRoot: true }))
  ); // KLWP only offers Shadow to items inside a group
  const rot = (mk, ok) => [
    E(mk, 'Rotate', ROT),
    N(ok, 'Rotate offset', 0, { show: not(mk, 'NONE', 'DEG90', 'DEG180', 'DEG270') })
  ];
  const TEXTCORE = [
    { k: 'text_expression', l: 'Text', t: 'formula', d: '$df(hh:mm)$' },
    { k: 'text_family', l: 'Font', t: 'font', d: '' }
  ];
  const BMP = pre => [
    N(pre + 'alpha', 'Opacity', 100, { min: 0, max: 100 }),
    N(pre + 'blur', 'Blur', 0, { min: 0 }),
    N(pre + 'dim', 'Dim', 0, { min: 0, max: 100 }),
    E(pre + 'filter', 'Filter', BFILTER),
    N(pre + 'filter_amount', 'Filter amount', 100, { min: 0, max: 100, show: not(pre + 'filter', 'NONE') }),
    C(pre + 'filter_color', 'Filter color', '#FFFFFFFF', { show: is(pre + 'filter', 'COLORIZE') })
  ];
  const LAYER = [
    E('config_visible', 'Visible', VISIBLE),
    N('config_scale_value', 'Scale', 100, { min: 0 }),
    ...rot('config_rotate_mode', 'config_rotate_offset'),
    E('config_location', 'Location', O('location', ['DEFAULT', 'PRIMARY', 'ALT1', 'ALT2', 'ALT3'])),
    E('config_fx', 'Layer FX', O('layerfx', ['NONE', 'DROP_SHADOW', 'INNER_SHADOW'])),
    C('config_fx_fcolor', 'FX color', '#FF000000', { show: not('config_fx', 'NONE') }),
    N('config_fx_radius', 'FX radius', 0, { show: not('config_fx', 'NONE') }),
    N('config_fx_angle', 'FX angle', 0, { show: not('config_fx', 'NONE') }),
    N('config_fx_dist', 'FX distance', 0, { show: not('config_fx', 'NONE') }),
    E('config_filter', 'Color filter', BFILTER),
    N('config_filter_amount', 'Filter amount', 100, { min: 0, max: 100 }),
    C('config_filter_color', 'Filter color')
  ];
  const tabAnim = { id: 'anim', label: 'Animation', special: 'animations' },
    tabTouch = { id: 'touch', label: 'Touch', special: 'events' };
  const tabPos = { id: 'position', label: 'Position', props: POSITION };

  const MODULES = {
    RootLayerModule: {
      name: 'Root',
      icon: 'root',
      tabs: [
        { id: 'items', label: 'Items', special: 'items' },
        {
          id: 'background',
          label: 'Background',
          props: [
            E('background_type', 'Type', O('backgroundtype', ['SOLID', 'IMAGE']), 'SOLID'),
            C('background_color', 'Color', '#FF000000'),
            { k: 'background_bitmap', l: 'Pick Image', t: 'bitmap', d: '', show: is('background_type', 'IMAGE') },
            E('background_scroll', 'Scroll', O('backgroundscroll', ['NORMAL', 'NONE', 'INVERTED']), 'NORMAL', {
              show: is('background_type', 'IMAGE')
            }),
            N('background_blur', 'Blur', 0, { min: 0, show: is('background_type', 'IMAGE') }),
            N('background_dim', 'Dim', 0, { min: 0, max: 100, show: is('background_type', 'IMAGE') }),
            E('background_filter', 'Filter', BFILTER, 'NONE', { show: is('background_type', 'IMAGE') }),
            N('background_filter_amount', 'Filter amount', 100, {
              min: 0,
              max: 100,
              show: not('background_filter', 'NONE')
            }),
            C('background_filter_color', 'Filter color', '#FFFFFFFF', { show: is('background_filter', 'COLORIZE') })
          ]
        },
        { id: 'layer', label: 'Layer', props: [N('config_scale_value', 'Scale', 100, { min: 0 })] },
        { id: 'globals', label: 'Globals', special: 'globals' },
        { id: 'touch', label: 'Shortcuts', special: 'events' },
        { id: 'flows', label: 'Flows', special: 'flows' }
      ]
    },
    OverlapLayerModule: {
      name: 'Overlap Group',
      icon: 'overlap',
      tabs: [
        { id: 'items', label: 'Items', special: 'items' },
        { id: 'layer', label: 'Layer', props: LAYER },
        tabPos,
        tabAnim,
        tabTouch
      ]
    },
    StackLayerModule: {
      name: 'Stack Group',
      icon: 'stack',
      tabs: [
        { id: 'items', label: 'Items', special: 'items' },
        {
          id: 'layer',
          label: 'Layer',
          props: [
            E(
              'config_stacking',
              'Stacking',
              O('layerstacking', [
                'VERTICAL_LEFT',
                'VERTICAL_CENTER',
                'VERTICAL_RIGHT',
                'HORIZONTAL_TOP',
                'HORIZONTAL_CENTER',
                'HORIZONTAL_BOTTOM'
              ])
            ),
            N('config_margin', 'Margin', 0)
          ].concat(LAYER)
        },
        tabPos,
        tabAnim,
        tabTouch
      ]
    },
    KomponentModule: {
      name: 'Komponent',
      icon: 'komp',
      tabs: [
        { id: 'globals', label: 'Globals', special: 'globals' },
        { id: 'items', label: 'Items', special: 'items' },
        { id: 'layer', label: 'Layer', props: LAYER },
        tabPos,
        tabAnim,
        tabTouch
      ]
    },
    TextModule: {
      name: 'Text',
      icon: 'text',
      tabs: [
        {
          id: 'text',
          label: 'Text',
          props: TEXTCORE.concat(
            [
              E(
                'text_size_type',
                'Size',
                O('fontsize', ['SINGLE_FONT_HEIGHT', 'SINGLE_FIXED_WIDTH', 'FIXED_WIDTH', 'FIT_TO_BOX'])
              ),
              N('text_size', 'Size', 20, { min: 0, show: is('text_size_type', 'SINGLE_FONT_HEIGHT', 'FIXED_WIDTH') }),
              N('text_width', 'Width', 100, { min: 0, show: not('text_size_type', 'SINGLE_FONT_HEIGHT') }),
              N('text_height', 'Height', 100, { min: 0, show: is('text_size_type', 'FIT_TO_BOX') }),
              N('text_lines', 'Max lines', 0, { min: 0, show: is('text_size_type', 'FIXED_WIDTH') }),
              E('text_align', 'Align', O('textalign', ['LEFT', 'CENTER', 'RIGHT']), 'LEFT', {
                show: not('text_size_type', 'SINGLE_FONT_HEIGHT')
              }),
              { k: 'text_filter', l: 'Filter', t: 'flags', o: O('textfilter', ['UP', 'LO', 'CAP']), d: [] }
            ],
            rot('text_rotate_mode', 'text_rotate_offset')
          )
        },
        { id: 'paint', label: 'Paint', props: PAINT },
        { id: 'fx', label: 'FX', props: FX },
        tabPos,
        tabAnim,
        tabTouch
      ]
    },
    CurvedTextModule: {
      name: 'Curved Text',
      icon: 'curved',
      tabs: [
        {
          id: 'text',
          label: 'Text',
          props: TEXTCORE.concat(
            [
              N('text_size', 'Size', 20, { min: 0 }),
              N('text_width', 'Width', 0, { min: 0 }),
              N('text_ratio', 'Ratio', 0),
              N('text_skew', 'Skew', 0),
              N('text_spacing', 'Spacing', 0),
              E('text_mode', 'Mode', O('curvedtextmode', ['AUTO', 'JUSTIFY'])),
              { k: 'text_filter', l: 'Filter', t: 'flags', o: O('textfilter', ['UP', 'LO', 'CAP']), d: [] }
            ],
            rot('text_rotate_mode', 'text_rotate_offset')
          )
        },
        { id: 'paint', label: 'Paint', props: PAINT },
        { id: 'fx', label: 'FX', props: FX },
        tabPos,
        tabAnim,
        tabTouch
      ]
    },
    ShapeModule: {
      name: 'Shape',
      icon: 'shape',
      tabs: [
        {
          id: 'shape',
          label: 'Shape',
          props: [
            E(
              'shape_type',
              'Type',
              O('shape', [
                'SQUARE',
                'RECT',
                'CIRCLE',
                'OVAL',
                'TRIANGLE',
                'RTRIANGLE',
                'EXAGON',
                'SLICE',
                'ARC',
                'SQUIRCLE'
              ])
            ),
            N('shape_width', 'Width', 100, { min: 0 }),
            N('shape_height', 'Height', 100, {
              min: 0,
              show: is('shape_type', 'RECT', 'OVAL', 'TRIANGLE', 'RTRIANGLE', 'ARC')
            }),
            N('shape_corners', 'Corners', 0, { min: 0, show: is('shape_type', 'RECT', 'SQUARE') }),
            N('shape_angle', 'Angle', 0, { show: is('shape_type', 'SLICE', 'ARC') })
          ].concat(rot('shape_rotate_mode', 'shape_rotate_offset'))
        },
        { id: 'paint', label: 'Paint', props: PAINT },
        { id: 'fx', label: 'FX', props: FX },
        tabPos,
        tabAnim,
        tabTouch
      ]
    },
    BitmapModule: {
      name: 'Image',
      icon: 'image',
      tabs: [
        {
          id: 'bitmap',
          label: 'Bitmap',
          props: [
            { k: 'bitmap_bitmap', l: 'Pick Image', t: 'bitmap', d: '' },
            E(
              'bitmap_scale_mode',
              'Scale',
              O('bitmapscalemode', ['FIT_WIDTH', 'FIT_HEIGHT', 'CENTER_FIT', 'CENTER_CROP'])
            ),
            N('bitmap_width', 'Width', 100, { min: 0 })
          ].concat(rot('bitmap_rmode', 'bitmap_rotate'))
        },
        { id: 'fx', label: 'FX', props: BMP('bitmap_').concat(SHADOW) },
        tabPos,
        tabAnim,
        tabTouch
      ]
    },
    MovieModule: {
      name: 'Animated Image',
      icon: 'movie',
      tabs: [
        {
          id: 'bitmap',
          label: 'Bitmap',
          props: [
            { k: 'bitmap_movie_uri', l: 'Pick Image', t: 'bitmap', d: '' },
            N('bitmap_width', 'Width', 100, { min: 0 })
          ].concat(rot('bitmap_rmode', 'bitmap_rotate'))
        },
        { id: 'fx', label: 'FX', props: BMP('bitmap_') },
        tabPos,
        tabAnim,
        tabTouch
      ]
    },
    FontIconModule: {
      name: 'Font Icon',
      icon: 'icon',
      tabs: [
        {
          id: 'icon',
          label: 'Icon',
          props: [
            { k: 'icon_set', l: 'Set', t: 'iconset', d: '' },
            { k: 'icon_icon', l: 'Icon', t: 'icon', d: '' },
            N('icon_size', 'Size', 80, { min: 0 })
          ].concat(rot('icon_rotate_mode', 'icon_rotate_offset'))
        },
        { id: 'paint', label: 'Paint', props: PAINT },
        { id: 'fx', label: 'FX', props: FX },
        tabPos,
        tabAnim,
        tabTouch
      ]
    },
    ProgressModule: {
      name: 'Progress',
      icon: 'progress',
      tabs: [
        {
          id: 'progress',
          label: 'Progress',
          props: [
            E('progress_progress', 'Progress', O('progress', ['BATTERY', 'MUSIC', 'CUSTOM'])),
            N('progress_level', 'Level', 50, { show: is('progress_progress', 'CUSTOM') }),
            N('progress_min', 'Min', 0, { show: is('progress_progress', 'CUSTOM') }),
            N('progress_max', 'Max', 100, { show: is('progress_progress', 'CUSTOM') }),
            E('progress_mode', 'Mode', O('progressmode', ['FLAT', 'SPLIT', 'SHAPES'])),
            N('progress_count', 'Items count', 12, { min: 1, show: not('progress_mode', 'FLAT') })
          ].concat(rot('progress_rotate_mode', 'progress_rotate_offset'))
        },
        {
          id: 'style',
          label: 'Style',
          props: [
            E('style_style', 'Style', O('progressstyle', ['LINEAR', 'CIRCLE'])),
            N('style_size', 'Size', 100, { min: 0 }),
            N('style_height', 'Height', 10, { min: 0 }),
            N('style_width', 'Width', 100, { min: 0 })
          ]
        },
        {
          id: 'color',
          label: 'Color',
          props: [
            C('color_fgcolor', 'Foreground'),
            C('color_bgcolor', 'Background', '#44FFFFFF'),
            C('color_tcolor', 'Text color')
          ]
        },
        tabPos,
        tabAnim,
        tabTouch
      ]
    }
  };
  const ADDABLE = [
    'TextModule',
    'ShapeModule',
    'BitmapModule',
    'FontIconModule',
    'ProgressModule',
    'CurvedTextModule',
    'MovieModule',
    'StackLayerModule',
    'OverlapLayerModule',
    'KomponentModule'
  ];

  const CENTERS = [
    'CENTER',
    'FIRST',
    'LAST',
    'SCREEN1',
    'SCREEN2',
    'SCREEN3',
    'SCREEN4',
    'SCREEN5',
    'SCREEN6',
    'SCREEN7',
    'SCREEN8',
    'SCREEN9',
    'CENTER_M3',
    'CENTER_M2',
    'CENTER_M1',
    'CENTER_P1',
    'CENTER_P2',
    'CENTER_P3'
  ];
  CENTERS.en = 'animationcenter';
  const ANIM = [
    E(
      'type',
      'ReactOn',
      O('animationtype', [
        'DISABLED',
        'SCROLL',
        'GYRO',
        'VISUALIZER',
        'SWITCH',
        'FORMULA',
        'UNLOCK',
        'LOOP_FW',
        'LOOP_2W'
      ]),
      'SCROLL'
    ),
    { k: 'trigger', l: 'Global', t: 'global', gt: 'SWITCH', d: '', show: is('type', 'SWITCH') },
    { k: 'formula', l: 'Formula', t: 'formula', d: '', show: is('type', 'FORMULA') },
    E(
      'action',
      'Action',
      O('animationaction', [
        'SCROLL',
        'SCROLL_INVERTED',
        'FADE',
        'FADE_INVERTED',
        'ROTATE',
        'ROTATE_INVERTED',
        'SCALE',
        'SCALE_INVERTED',
        'SCALE_X',
        'SCALE_Y',
        'COLOR',
        'COLOR_INVERTED',
        'ADVANCED'
      ]),
      'SCROLL'
    ),
    E(
      'rule',
      'Rule',
      O('animationrule', ['CENTER', 'BEFORE_CENTER', 'AFTER_CENTER', 'UP_TO_CENTER', 'FROM_CENTER']),
      'CENTER',
      { show: is('type', 'SCROLL', 'SCROLL_Y') }
    ),
    E('center', 'Center', CENTERS, 'CENTER', { show: is('type', 'SCROLL', 'SCROLL_Y', 'UNLOCK') }),
    E('axis', 'Axis', O('animationaxis', ['X', 'Y', 'XY']), 'X', { show: is('type', 'GYRO') }),
    E('vbars', 'Bars', ['BARS_8', 'BARS_16', 'BARS_32', 'BARS_64'], 'BARS_8', { show: is('type', 'VISUALIZER') }),
    N('vbaridx', 'Bar Index', 0, { show: is('type', 'VISUALIZER') }),
    N('speed', 'Speed', 100),
    N('amount', 'Amount', 100, { show: not('action', 'SCROLL', 'SCROLL_INVERTED', 'ADVANCED') }),
    N('angle', 'Angle', 0, { show: is('action', 'SCROLL', 'SCROLL_INVERTED') }),
    N('duration', 'Duration (tenths of a second)', 10, {
      show: not('type', 'SCROLL', 'SCROLL_Y', 'GYRO', 'VISUALIZER')
    }),
    N('delay', 'Delay (tenths of a second)', 0, { show: not('type', 'SCROLL', 'SCROLL_Y', 'GYRO', 'VISUALIZER') }),
    E(
      'ease',
      'Ease',
      O('animationease', ['NORMAL', 'STRAIGHT', 'ACCELERATE', 'DECELERATE', 'OVERSHOOT', 'BOUNCE']),
      'NORMAL'
    ),
    E('mode', 'Mode', O('animationmode', ['NORMAL', 'FORWARD', 'BACKWARD', 'INVERTED']), 'NORMAL', {
      show: is('type', 'SWITCH', 'FORMULA', 'UNLOCK')
    }),
    E(
      'anchor',
      'Anchor',
      O('animationanchor', ['MODULE_CENTER', 'MODULE_LEFT', 'MODULE_RIGHT', 'MODULE_TOP', 'MODULE_BOTTOM']),
      'MODULE_CENTER',
      { show: not('action', 'SCROLL', 'SCROLL_INVERTED', 'FADE', 'FADE_INVERTED') }
    ),
    N('limit', 'Limit', 0, { show: is('type', 'GYRO') }),
    E('filter', 'Filter', O('animationfilter', []), 'DARKEN', { show: is('action', 'COLOR', 'COLOR_INVERTED') }),
    { k: 'animator', l: 'Animator', t: 'keyframes', d: [], show: is('action', 'ADVANCED') }
  ];
  const KEYPROPS = O('animatorproperty', [
    'X_OFFSET',
    'Y_OFFSET',
    'OPACITY',
    'SCALE_XY',
    'SCALE_X',
    'SCALE_Y',
    'ROTATE'
  ]);
  const EVENT = [
    E('type', 'Type', O('touchtype', ['SINGLE_TAP', 'DOUBLE_TAP', 'LONG_PRESS']), 'SINGLE_TAP'),
    E(
      'action',
      'Action',
      O('touchaction', [
        'LAUNCH_APP',
        'LAUNCH_ACTIVITY',
        'LAUNCH_SHORTCUT',
        'SWITCH_GLOBAL',
        'KUSTOM_ACTION',
        'MUSIC',
        'OPEN_LINK',
        'CHANGE_VOLUME',
        'TRIGGER_FLOW',
        'NONE',
        'DISABLED'
      ]),
      'LAUNCH_APP'
    ),
    T('intent', 'App / intent', {
      show: is('action', 'LAUNCH_APP', 'LAUNCH_ACTIVITY', 'LAUNCH_SHORTCUT', 'APP_AND_SWITCH', 'SHORTCUT_AND_SWITCH')
    }),
    { k: 'switch', l: 'Switch', t: 'global', d: '', show: g => /SWITCH/.test(g('action')) },
    T('switch_list', 'List action (NEXT / PREV / value)', { show: is('action', 'SWITCH_GLOBAL') }),
    { k: 'switch_text', l: 'Text', t: 'formula', d: '', show: is('action', 'SWITCH_GLOBAL', 'TRIGGER_FLOW') },
    E('kustom_action', 'Kustom action', O('kustomaction', ['ADVANCED_EDITOR']), 'ADVANCED_EDITOR', {
      show: is('action', 'KUSTOM_ACTION', 'KUSTOM_ACTION_AND_SWITCH')
    }),
    N('notification', 'Notification index', 0, {
      show: g => /KUSTOM_ACTION/.test(g('action')) && /^NOTIF_(OPEN|CLOSE)$/.test(g('kustom_action'))
    }),
    E('music_action', 'Music action', O('musicaction', ['PLAY_PAUSE', 'NEXT', 'PREVIOUS']), 'PLAY_PAUSE', {
      show: is('action', 'MUSIC', 'MUSIC_AND_SWITCH')
    }),
    { k: 'url', l: 'URL', t: 'formula', d: '', show: is('action', 'OPEN_LINK') },
    E('volume_action', 'Volume action', O('volumeaction', ['RAISE', 'LOWER']), 'RAISE', {
      show: is('action', 'CHANGE_VOLUME')
    }),
    E('volume_stream', 'Stream', O('volumestream', ['MEDIA']), 'MEDIA', { show: is('action', 'CHANGE_VOLUME') }),
    { k: 'flow_id', l: 'Flow', t: 'flow', d: '', show: is('action', 'TRIGGER_FLOW') }
  ];
  const GLOBAL_TYPES = ['TEXT', 'NUMBER', 'COLOR', 'SWITCH', 'LIST', 'BITMAP', 'FONT', 'FOLDER'];
  const optLabel = (en, v) => {
    const m = en && L.opt[en];
    if (!m) return null;
    if (m[v]) return m[v];
    let x = /^SCREEN(\d)$/.exec(v);
    if (x) return 'Screen ' + x[1];
    x = /^CENTER_([MP])(\d)$/.exec(v);
    if (x) return 'Center ' + (x[1] === 'M' ? 'Minus ' : 'Plus ') + x[2];
    return null;
  };

  // Formula reference shown in the formula editor (function, signature, description, examples)
  const FUNCS = [
    ['gv', 'gv(name, [default])', 'Global variable', ['$gv(mycolor)$', '$gv(folder/name)$']],
    [
      'if',
      'if(cond, then, [cond2, then2…], [else])',
      'Conditional',
      ['$if(bi(level) <= 15, low, ok)$', '$if(si(locked) = 1 & df(H) > 21, a, b)$']
    ],
    ['df', 'df(format, [date])', 'Date format', ['$df(hh:mm a)$', '$df(EEEE)$', '$df(dd MMM yyyy, a1d)$']],
    ['dp', 'dp(date)', 'Date parser (returns seconds)', ['$dp(a1d0h0m0s)$']],
    ['tf', 'tf(date, [format])', 'Time span', ['$tf(ai(sunset))$', '$tf(mi(len), mm:ss)$']],
    [
      'mu',
      'mu(fn, values…)',
      'Math: ceil floor sqrt round min max abs sin cos tan asin acos atan log ln rnd h2d d2h',
      ['$mu(round, 3.146, 2)$', '$mu(rnd, 1, 6)$']
    ],
    [
      'tc',
      'tc(fn, text, …)',
      'Text: low up cap cut ell count utf len n2w ord roman split reg html url lines type json lpad rpad',
      ['$tc(up, hello)$', '$tc(cut, abcdef, 2)$', '$tc(split, "a,b,c", ",", 1)$', '$tc(reg, hello, "l+", L)$']
    ],
    [
      'ce',
      'ce(color, filter, [amount])',
      'Color editor: alpha sat lum comp contrast invert, or ce(c1, c2, amount) to mix',
      ['$ce(#FF0000, alpha, 50)$', '$ce(#FF0000, lum, a20)$', '$ce(#FF0000, comp)$']
    ],
    ['cm', 'cm([a], r, g, b, [h])', 'Color maker', ['$cm(255, 128, 0)$', '$cm(128, 255, 128, 0)$']],
    ['fl', 'fl(init, stop, increment, text, [sep])', 'For loop', ['$fl(1, 5, "i+1", "i*2", ",")$']],
    ['lv', 'lv(name, [value])', 'Local variable (read with #name)', ['$lv(x, 5)$$#x * 2$']],
    [
      'si',
      'si(field)',
      'System info: rwidth rheight rratio screen screens land locked darkmode volr mindex mcount ringer alarmon wpcolor1 sysca1…',
      ['$si(rwidth)$', '$si(screen)$', '$si(land)$']
    ],
    [
      'bi',
      'bi(field)',
      'Battery: level temp charging plugged volt source current fullempty',
      ['$bi(level)$%', '$bi(charging)$']
    ],
    [
      'wi',
      'wi(field)',
      'Current weather: temp flik cond icon tempu hum press wspeed wspeedm wdir wchill clouds uvindex dpoint updated provider',
      ['$wi(temp)$°$wi(tempu)$', '$wi(cond)$']
    ],
    [
      'wf',
      'wf(field, day)',
      'Weather forecast: min max temp cond icon wspeed wdir hum rain rainc',
      ['$wf(max, 1)$', '$wf(icon, 0)$']
    ],
    [
      'mi',
      'mi(field)',
      'Music: title artist album state len pos percent vol package cover track',
      ['$mi(title)$', '$mi(state)$']
    ],
    ['li', 'li(field)', 'Location: loc country ccode addr admin neigh postal lat lon alt spd', ['$li(loc)$']],
    [
      'ai',
      'ai(field)',
      'Astronomy: sunrise sunset isday mphase zodiac season mage mill moonrise moonset',
      ['$df(hh:mm, ai(sunset))$', '$ai(isday)$']
    ],
    [
      'nc',
      'nc(field)',
      'Connectivity: wifi cell ssid wsig csig operator dtype bt acount aname airplane',
      ['$nc(ssid)$', '$nc(csig)$']
    ],
    [
      'ni',
      'ni(index, field) / ni(count)',
      'Notifications: title text desc app pkg count time',
      ['$ni(count)$', '$ni(0, title)$']
    ],
    [
      'ci',
      'ci(field, index)',
      'Calendar events: title desc loc start end allday color cname',
      ['$ci(title, 0)$', '$df(hh:mm, ci(start, 0))$']
    ],
    ['rm', 'rm(field)', 'Resources: used free total fsfree fsused cpu up', ['$rm(free)$']],
    ['uc', 'uc(type)', 'Unread counters: sms calls gmail whatsapp', ['$uc(sms)$']],
    ['bp', 'bp(palette, bitmap)', 'Bitmap palette (simulated colour in preview)', ['$bp(vibrant, mi(cover))$']],
    ['tu', 'tu(fn, …)', 'Timer utils: rnd seq', ['$tu(rnd, 10s, 1, 100)$', '$tu(seq, 1m, 0, 5)$']],
    ['fd', 'fd(field)', 'Fitness data: steps cals dista time', ['$fd(steps)$']],
    ['aq', 'aq(field)', 'Air quality: index label level no2 pm10 pm25', ['$aq(index)$']],
    [
      'wg',
      'wg(url, filter, …)',
      'Web get (no network in preview; returns simulated value)',
      ['$wg("http://…", rss, 0, title)$']
    ],
    ['sh', 'sh(command)', 'Shell command (not available in preview)', []],
    ['br', 'br(source, var)', 'Broadcast receiver / Tasker variable (simulated)', ['$br(tasker, myvar)$']],
    ['ts', 'ts(field)', 'Traffic stats (simulated)', ['$ts(trx)$']],
    ['mq', 'mq(field)', 'Music queue (simulated)', ['$mq(title)$']]
  ];
  // Features recorded in preset_info, derived from the functions a preset uses.
  const FEATURES = {
    wi: 'WEATHER',
    wf: 'FORECAST',
    li: 'LOCATION',
    ci: 'CALENDAR',
    mi: 'MUSIC',
    mq: 'MUSIC',
    wg: 'DOWNLOAD',
    ni: 'NOTIFICATIONS',
    uc: 'UNREAD',
    aq: 'AIR_QUALITY',
    fd: 'FITNESS',
    sh: 'SHELL',
    nc: 'NETWORK_INFO',
    'anim:GYRO': 'GYRO',
    'anim:VISUALIZER': 'VISUALIZER'
  };

  G.KSchema = { MODULES, ADDABLE, ANIM, EVENT, KEYPROPS, GLOBAL_TYPES, FUNCS, FEATURES, ANCHORS, optLabel };
})(window);
