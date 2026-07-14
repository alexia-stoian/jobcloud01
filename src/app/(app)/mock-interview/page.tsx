'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MockInterviewPage() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [targetRole, setTargetRole] = useState('');
  const [loading, setLoading] = useState(false);

  const interviewTypes = [
    { id: 'behavioral', label: 'Behavioral Interview', desc: 'STAR method questions' },
    { id: 'technical', label: 'Technical Interview', desc: 'Coding and system design' },
    { id: 'case-study', label: 'Case Study Interview', desc: 'Problem solving scenarios' },
    { id: 'cultural-fit', label: 'Cultural Fit Interview', desc: 'Values and collaboration' },
  ];

  const handleStartInterview = async () => {
    if (!selectedType || !targetRole.trim()) {
      alert('Please select interview type and enter target role');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/mock-interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interviewType: selectedType, targetRole }),
      });

      if (response.ok) {
        const { sessionId } = await response.json();
        // TODO: Navigate to interview session page once created
        // For now, redirect to dashboard with message
        alert(`Interview started! Session ID: ${sessionId}`);
        router.push('/dashboard');
      } else {
        alert('Failed to start interview');
      }
    } catch (error) {
      alert('Error starting interview');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🎯 Mock Interview Engine
          </h1>
          <p className="text-gray-600">
            Practice interviews with AI to prepare for real opportunities
          </p>
        </div>

        {/* Interview Type Selection */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">
            Choose Interview Type
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {interviewTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => setSelectedType(type.id)}
                className={`p-4 border-2 rounded-lg text-left transition-all ${
                  selectedType === type.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-semibold text-gray-900">{type.label}</div>
                <div className="text-sm text-gray-600">{type.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Target Role Input */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-6">
          <label className="block text-lg font-semibold mb-3 text-gray-900">
            Target Role
          </label>
          <input
            type="text"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            placeholder="e.g., Senior Software Engineer"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-sm text-gray-600 mt-2">
            The role you&apos;re interviewing for
          </p>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStartInterview}
          disabled={!selectedType || !targetRole.trim() || loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 px-6 rounded-lg transition-colors"
        >
          {loading ? 'Starting Interview...' : 'Start Interview Session'}
        </button>
      </div>
    </div>
  );
}
