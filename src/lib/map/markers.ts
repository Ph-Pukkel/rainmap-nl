export interface MarkerConfig {
  sourceKey: string;
  iconName: string;
  color: string;
  size: number;
  strokeColor: string;
  strokeWidth: number;
}

export const MARKER_CONFIGS: Record<string, MarkerConfig> = {
  knmi_aws: {
    sourceKey: 'knmi_aws',
    iconName: 'knmi-marker',
    color: '#E74C3C',
    size: 10,
    strokeColor: '#FFFFFF',
    strokeWidth: 2,
  },
  knmi_neerslag: {
    sourceKey: 'knmi_neerslag',
    iconName: 'knmi-vol-marker',
    color: '#E67E22',
    size: 8,
    strokeColor: '#FFFFFF',
    strokeWidth: 1.5,
  },
  rws_waterinfo: {
    sourceKey: 'rws_waterinfo',
    iconName: 'rws-marker',
    color: '#3498DB',
    size: 9,
    strokeColor: '#FFFFFF',
    strokeWidth: 1.5,
  },
  waterschappen: {
    sourceKey: 'waterschappen',
    iconName: 'ws-marker',
    color: '#2ECC71',
    size: 8,
    strokeColor: '#FFFFFF',
    strokeWidth: 1.5,
  },
  wow_nl: {
    sourceKey: 'wow_nl',
    iconName: 'wow-marker',
    color: '#9B59B6',
    size: 7,
    strokeColor: '#FFFFFF',
    strokeWidth: 1,
  },
  netatmo: {
    sourceKey: 'netatmo',
    iconName: 'netatmo-marker',
    color: '#1ABC9C',
    size: 6,
    strokeColor: '#FFFFFF',
    strokeWidth: 1,
  },
  agro: {
    sourceKey: 'agro',
    iconName: 'agro-marker',
    color: '#F39C12',
    size: 8,
    strokeColor: '#FFFFFF',
    strokeWidth: 1.5,
  },
};
