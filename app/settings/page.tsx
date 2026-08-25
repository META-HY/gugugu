'use client';

import {
  Button,
  Card,
  Divider,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  App,
} from 'antd';
import { ArrowLeftOutlined, ExportOutlined, ImportOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useRef } from 'react';
import { APP_NAME, APP_VERSION, DEFAULT_REFRESH, REFRESH_OPTIONS } from '@/lib/config';
import type { UserSettings } from '@/lib/types';
import { useFundStore, type FundBackup } from '@/lib/store/useFundStore';
import { getTradeState } from '@/lib/utils/tradeCalendar';

export default function SettingsPage() {
  const settings = useFundStore((s) => s.settings);
  const updateSettings = useFundStore((s) => s.updateSettings);
  const groups = useFundStore((s) => s.groups);
  const watchlist = useFundStore((s) => s.watchlist);
  const importData = useFundStore((s) => s.importData);
  const refreshQuotes = useFundStore((s) => s.refreshQuotes);
  const { message, modal } = App.useApp();
  const state = getTradeState();
  const fileRef = useRef<HTMLInputElement>(null);

  const applyBackup = (backup: FundBackup) => {
    const result = importData(backup);
    if (!result.ok) {
      message.error(result.error ?? '导入失败，请检查文件格式');
      return;
    }
    refreshQuotes(backup.watchlist?.map((w) => w.code) ?? [], 'mock');
    message.success('导入成功，自选与设置已还原');
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (watchlist.length || groups.length > 1) {
          modal.confirm({
            title: '确认覆盖导入',
            content: '导入将覆盖当前的自选列表与分组设置，确定继续吗？',
            okText: '覆盖导入',
            okButtonProps: { danger: true },
            onOk: () => applyBackup(parsed as FundBackup),
          });
        } else {
          applyBackup(parsed as FundBackup);
        }
      } catch {
        message.error('文件解析失败，请选择本工具导出的 JSON 备份文件');
      }
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const payload = {
      app: APP_NAME,
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      settings,
      groups,
      watchlist,
      fundCount: watchlist.length,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `基金自选备份_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    message.success('已导出 JSON 文件');
  };

  return (
    <div className="section-stagger" style={{ maxWidth: 720, display: 'grid', gap: 16 }}>
      <div>
        <Link href="/funds">
          <Button type="text" icon={<ArrowLeftOutlined />}>
            返回自选
          </Button>
        </Link>
      </div>
      <Card>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          个性化设置
        </Typography.Title>
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <div className="settings-row">
            <div>
              <Typography.Text strong>刷新频率</Typography.Text>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  交易时段内自选估值自动刷新间隔
                </Typography.Text>
              </div>
            </div>
            <Select
              style={{ width: 140 }}
              value={settings.refreshInterval}
              options={REFRESH_OPTIONS}
              onChange={(v) => updateSettings({ refreshInterval: v })}
            />
          </div>

          <Divider style={{ margin: 0 }} />

          <div className="settings-row">
            <div>
              <Typography.Text strong>主题外观</Typography.Text>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  跟随系统，或手动指定亮色 / 暗色
                </Typography.Text>
              </div>
            </div>
            <Segmented
              value={settings.themeMode}
              onChange={(v) => updateSettings({ themeMode: v as UserSettings['themeMode'] })}
              options={[
                { label: '跟随系统', value: 'auto' },
                { label: '亮色', value: 'light', icon: <SunOutlined /> },
                { label: '暗色', value: 'dark', icon: <MoonOutlined /> },
              ]}
            />
          </div>

          <Divider style={{ margin: 0 }} />

          <div className="settings-row">
            <div>
              <Typography.Text strong>隐私模式</Typography.Text>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  隐藏金额、收益等敏感数据
                </Typography.Text>
              </div>
            </div>
            <Switch
              checked={settings.privacyMode}
              onChange={(v) => updateSettings({ privacyMode: v })}
            />
          </div>

          <Divider style={{ margin: 0 }} />

          <div className="settings-row">
            <div>
              <Typography.Text strong>数据备份与还原</Typography.Text>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  导出自选列表与设置；或导入之前备份的 JSON 文件进行还原
                </Typography.Text>
              </div>
            </div>
            <Space>
              <Button icon={<ImportOutlined />} onClick={() => fileRef.current?.click()}>
                导入自选
              </Button>
              <Button icon={<ExportOutlined />} onClick={handleExport}>
                导出自选
              </Button>
            </Space>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = '';
            }}
          />
        </Space>
      </Card>

      <Card>
        <Typography.Text type="secondary">当前：</Typography.Text>
        <Space size={8} wrap>
          <Tag color="blue">{settings.refreshInterval}ms 刷新</Tag>
          <Tag>
            {settings.themeMode === 'auto' ? '跟随系统' : settings.themeMode === 'dark' ? '暗色' : '亮色'}主题
          </Tag>
          <Tag color={settings.privacyMode ? 'warning' : 'default'}>
            {settings.privacyMode ? '隐私模式已开启' : '隐私模式关闭'}
          </Tag>
          <Tag color={state.isSession ? 'success' : 'default'}>{state.message}</Tag>
        </Space>
      </Card>

      <Card>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          说明：默认刷新频率为 {DEFAULT_REFRESH / 1000} 秒；非交易时段自动停止实时请求，页面不可见时也会暂停刷新以节省资源。本工具定位为数据查看工具，不提供任何投资建议。
        </Typography.Text>
      </Card>
    </div>
  );
}