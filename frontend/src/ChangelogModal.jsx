import { useState, useEffect } from 'react';
import { X, GitCommit, ExternalLink } from 'lucide-react';

const REPO = 'chen2438/device-status-dashboard';
const API_URL = `https://api.github.com/repos/${REPO}/commits?per_page=30`;

function ChangelogModal({ isOpen, onClose }) {
    const [commits, setCommits] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        setError(null);
        fetch(API_URL)
            .then(res => {
                if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
                return res.json();
            })
            .then(data => {
                setCommits(data);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, [isOpen]);

    if (!isOpen) return null;

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="changelog-overlay" onClick={onClose}>
            <div className="changelog-modal" onClick={e => e.stopPropagation()}>
                <div className="changelog-header">
                    <h2><GitCommit size={20} /> Changelog</h2>
                    <button className="changelog-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                <div className="changelog-body">
                    {loading && <div className="changelog-loading">Loading commits...</div>}
                    {error && <div className="changelog-error">Error: {error}</div>}
                    {!loading && !error && commits.map((commit) => (
                        <div key={commit.sha} className="changelog-item">
                            <div className="changelog-item-header">
                                <span className="changelog-sha">{commit.sha.substring(0, 7)}</span>
                                <span className="changelog-date">{formatDate(commit.commit.author.date)}</span>
                            </div>
                            <div className="changelog-message">{commit.commit.message}</div>
                            <div className="changelog-author">
                                {commit.author?.avatar_url && (
                                    <img src={commit.author.avatar_url} alt="" className="changelog-avatar" />
                                )}
                                <span>{commit.commit.author.name}</span>
                                <a href={commit.html_url} target="_blank" rel="noopener noreferrer" className="changelog-link">
                                    <ExternalLink size={12} />
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default ChangelogModal;
