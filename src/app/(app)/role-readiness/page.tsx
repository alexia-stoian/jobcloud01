'use client';

import { useState, useEffect } from 'react';

interface ReadinessScore {
  roleId: string;
  roleName: string;
  overallReadiness: number;
  breakdown: {
    experience: number;
    skills: number;
    education: number;
    workPermit: number;
    location: number;
  };
  strengths: string[];
  gaps: string[];
  timeToReady: string;
}

export default function ReadinessPage() {
  const [scores, setScores] = useState<ReadinessScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReadinessScores();
  }, []);

  const fetchReadinessScores = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/readiness/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // Use default top roles
      });

      if (response.ok) {
        const data = await response.json();
        setScores(data.scores);
      }
    } catch (error) {
      console.error('Error fetching readiness scores:', error);
    } finally {
      setLoading(false);
    }
  };

  const getReadinessColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-blue-600';
    if (score >= 50) return 'text-amber-600';
    return 'text-red-600';
  };

  const getScoreBackground = (score: number) => {
    if (score >= 85) return 'bg-green-50 border-l-4 border-green-600';
    if (score >= 70) return 'bg-blue-50 border-l-4 border-blue-600';
    if (score >= 50) return 'bg-amber-50 border-l-4 border-amber-600';
    return 'bg-red-50 border-l-4 border-red-600';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Calculating your readiness scores...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🎯 Role Readiness Analysis
          </h1>
          <p className="text-gray-600">
            See how ready you are for different roles and what you need to work on
          </p>
        </div>

        {/* Summary Stats */}
        {scores.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="text-sm text-gray-600 mb-2">Best Match</div>
              <div className="text-2xl font-bold text-green-600">
                {scores[0].roleName}
              </div>
              <div className="text-lg font-semibold text-gray-900 mt-1">
                {scores[0].overallReadiness}% Ready
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="text-sm text-gray-600 mb-2">Average Readiness</div>
              <div className="text-2xl font-bold text-blue-600">
                {Math.round(scores.reduce((sum, s) => sum + s.overallReadiness, 0) / scores.length)}%
              </div>
              <div className="text-lg font-semibold text-gray-900 mt-1">
                Across {scores.length} roles
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="text-sm text-gray-600 mb-2">Roles Analyzed</div>
              <div className="text-2xl font-bold text-purple-600">{scores.length}</div>
              <div className="text-lg font-semibold text-gray-900 mt-1">
                High-demand positions
              </div>
            </div>
          </div>
        )}

        {/* Readiness Scores List */}
        <div className="space-y-4">
          {scores.map((score) => (
            <div key={score.roleId} className={`rounded-lg shadow-md p-6 ${getScoreBackground(score.overallReadiness)}`}>
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{score.roleName}</h3>
                  <p className="text-sm text-gray-600 mt-1">{score.timeToReady}</p>
                </div>
                <div className={`text-4xl font-bold ${getReadinessColor(score.overallReadiness)}`}>
                  {score.overallReadiness}%
                </div>
              </div>

              {/* Score Breakdown */}
              <div className="grid grid-cols-5 gap-2 mb-4">
                {Object.entries(score.breakdown).map(([dimension, value]) => (
                  <div key={dimension} className="bg-white rounded p-2 text-center">
                    <div className="text-xs font-semibold text-gray-600 capitalize mb-1">
                      {dimension}
                    </div>
                    <div className="text-lg font-bold text-gray-900">{value}%</div>
                  </div>
                ))}
              </div>

              {/* Strengths & Gaps */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Strengths */}
                {score.strengths.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">✅ Strengths</h4>
                    <ul className="text-sm text-gray-700 space-y-1">
                      {score.strengths.map((s, i) => (
                        <li key={i} className="flex items-start">
                          <span className="mr-2">•</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Gaps */}
                {score.gaps.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">📈 Areas to Improve</h4>
                    <ul className="text-sm text-gray-700 space-y-1">
                      {score.gaps.map((g, i) => (
                        <li key={i} className="flex items-start">
                          <span className="mr-2">•</span>
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
