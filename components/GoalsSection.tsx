import { QuarterlyGoal } from "@/types";

interface GoalsSectionProps {
  goals: QuarterlyGoal[];
  quarter: string;
}

export default function GoalsSection({ goals, quarter }: GoalsSectionProps) {
  if (goals.length === 0) return null;

  return (
    <section id="goals-section" className="pt-6 mb-8" data-track="goals">
      <div className="bg-[#FFF8EE] rounded-2xl px-8 py-6">
        <h2 className="text-base font-semibold mb-3 text-[#1A1A1A]">
          Quarterly Goals
          <span className="text-[#8B5E00] font-normal text-xs ml-2">{quarter}</span>
        </h2>
        <div className="space-y-2">
          {goals.map((goal) => {
            const isComplete = goal.verified && goal.progress >= 100;
            const hasLiveData = goal.verified === true;
            return (
              <div
                key={goal.id}
                className={`rounded-xl p-4 ${
                  isComplete
                    ? "bg-white/80 border border-[#BDFFE8]"
                    : "bg-white/80 border border-[#FFD69E]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {isComplete ? (
                    <span className="text-base" title="Goal achieved!">{"\uD83C\uDF89"}</span>
                  ) : (
                    <span className="text-base">{goal.icon}</span>
                  )}
                  <span className="text-sm font-medium text-[#1A1A1A]">
                    {goal.goal}
                  </span>
                  {isComplete && (
                    <span className="text-[10px] bg-[#BDFFE8] text-[#0d5a3f] px-2 py-0.5 rounded-full font-medium">
                      Achieved
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-[#8B5E00] ml-6">
                  <span>Target: {goal.targetMetric}</span>
                  {hasLiveData && goal.currentValue !== undefined && (
                    <span className="font-medium text-[#1A1A1A]">Current: {goal.currentValue.toLocaleString()}</span>
                  )}
                  <span>Deadline: End of {quarter}</span>
                  {hasLiveData ? (
                    <span className="font-medium text-[#1A1A1A]">
                      {isComplete ? "100%" : `${goal.progress}%`}
                    </span>
                  ) : (
                    <span className="text-[#B08A45] italic">Awaiting data</span>
                  )}
                </div>
                {hasLiveData && !isComplete && (
                  <div className="mt-2 ml-6">
                    <div className="h-1.5 bg-[#FFD69E] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(goal.progress, 100)}%`,
                          backgroundColor: "#FF9500",
                        }}
                      />
                    </div>
                  </div>
                )}
                {!hasLiveData && (
                  <div className="mt-2 ml-6">
                    <div className="h-1.5 bg-[#FFD69E]/50 rounded-full" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
