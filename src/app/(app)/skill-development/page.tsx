'use client';

import { useState, useEffect } from 'react';

interface SkillGap {
  skill: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

interface Resource {
  id: string;
  title: string;
  type: string;
  source: string;
  cost: string;
  difficulty: string;
  duration?: string;
}

export default function SkillDevelopmentPage() {
  const [skillGaps, setSkillGaps] = useState<SkillGap[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [progress, setProgress] = useState({ totalCompleted: 0, progressPercent: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch identified skill gaps
        const gapsRes = await fetch('/api/skill-development/resources');
        const gapsData = await gapsRes.json();
        setSkillGaps(gapsData.gaps || []);
        if (gapsData.gaps?.length > 0) {
          setSelectedSkill(gapsData.gaps[0].skill);
        }

        // Fetch progress
        const progressRes = await fetch('/api/skill-development/progress');
        const progressData = await progressRes.json();
        setProgress(progressData);
      } catch (error) {
        console.error('Error fetching skill data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  useEffect(() => {
    if (selectedSkill) {
      fetchResources();
    }
  }, [selectedSkill]);

  const fetchResources = async () => {
    try {
      const res = await fetch(
        `/api/skill-development/resources?skillGap=${encodeURIComponent(selectedSkill || '')}`
      );
      const data = await res.json();
      setResources(data.resources || []);
    } catch (error) {
      console.error('Error fetching resources:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading learning resources...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            📚 Skill Development Path
          </h1>
          <p className="text-gray-600">
            Close your skill gaps with curated learning resources
          </p>
        </div>

        {/* Progress Card */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Learning Progress</h3>
              <p className="text-2xl font-bold text-green-600 mt-2">
                {progress.totalCompleted} resources completed
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-green-600">
                {progress.progressPercent}%
              </div>
              <p className="text-gray-600">Overall progress</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Skill Gaps Sidebar */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-900">
              Identified Gaps ({skillGaps.length})
            </h2>
            <div className="space-y-2">
              {skillGaps.map((gap) => (
                <button
                  key={gap.skill}
                  onClick={() => setSelectedSkill(gap.skill)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedSkill === gap.skill
                      ? 'bg-green-100 border-l-4 border-green-600'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="font-semibold text-gray-900">{gap.skill}</div>
                  <div className="text-xs text-gray-600 capitalize mt-1">
                    {gap.priority} priority
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Resources List */}
          <div className="lg:col-span-3 bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-900">
              Recommended Resources: {selectedSkill}
            </h2>
            <div className="space-y-4">
              {resources.length === 0 ? (
                <p className="text-gray-500">No resources found for this skill</p>
              ) : (
                resources.map((resource) => (
                  <div
                    key={resource.id}
                    className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{resource.title}</h3>
                        <div className="flex gap-2 mt-2">
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {resource.type}
                          </span>
                          <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
                            {resource.difficulty}
                          </span>
                          <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded">
                            {resource.cost}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-2">{resource.source}</p>
                        {resource.duration && (
                          <p className="text-xs text-gray-500 mt-1">⏱️ {resource.duration}</p>
                        )}
                      </div>
                      <button className="ml-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">
                        Start Learning
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
