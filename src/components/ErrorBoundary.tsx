import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Result, Typography } from 'antd';

const { Paragraph, Text } = Typography;

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 全局错误边界。
 *
 * 2026-09-20 加钉钉扫码登录时踩到：第三方 SDK 会直接操作 DOM，
 * 把 React 管理的节点清掉，之后 React 去删那个不存在的节点就会抛异常。
 * 没有错误边界的话，React 会卸载整棵树 —— 用户看到的是**白屏**，
 * 连"出错了"都不说，完全没法排查。
 *
 * 这里把错误原样显示出来，至少能截图定位。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('页面崩溃:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Result
        status="error"
        title="页面出错了"
        subTitle="把下面这段文字截图发给 Claude，能直接定位问题"
        extra={
          <Button type="primary" onClick={() => window.location.reload()}>
            刷新重试
          </Button>
        }
      >
        <Paragraph>
          <Text strong>
            {error.name}: {error.message}
          </Text>
        </Paragraph>
        <Paragraph>
          <Text code style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
            {(error.stack ?? '(没有堆栈信息)').split('\n').slice(0, 8).join('\n')}
          </Text>
        </Paragraph>
      </Result>
    );
  }
}
