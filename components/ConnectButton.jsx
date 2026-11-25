'use client';
import { ConnectControls } from './FoundActions';

/** Connection request button for a saved prospect (Top 20 table). */
export default function ConnectButton({ id, url, sentAt, name }) {
  return <ConnectControls id={id} url={url} name={name} sentAt={sentAt} />;
}
