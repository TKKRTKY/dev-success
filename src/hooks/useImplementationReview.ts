import { useCallback, useState } from 'react'
import type {
  FeatureSeed,
  ImplementationReview,
  ProjectConfig,
} from '../domain/types'
import {
  createImplementationReview,
  evaluateImplementationReadiness,
} from '../implementationReview'
import { generateRecommendedVerifications } from '../recommendedVerifications'

type ReviewUpdate = Partial<
  Pick<
    ImplementationReview,
    | 'agentRun'
    | 'repositoryDiff'
    | 'verifications'
    | 'operationErrors'
  >
>

interface UseImplementationReviewInput {
  initialReviews: ImplementationReview[]
  featureSeeds: FeatureSeed[]
  projectConfig: ProjectConfig
  onChange: (reviews: ImplementationReview[]) => void
}

export const useImplementationReview = ({
  initialReviews,
  featureSeeds,
  projectConfig,
  onChange,
}: UseImplementationReviewInput) => {
  const [implementationReviews, setImplementationReviewsState] =
    useState<ImplementationReview[]>(initialReviews)

  const updateImplementationReview = useCallback(
    (
      featureSeedId: string,
      update: ReviewUpdate,
      baseReview?: ImplementationReview,
    ): ImplementationReview => {
      const current =
        baseReview ??
        implementationReviews.find(
          (review) => review.featureSeedId === featureSeedId,
        ) ??
        createImplementationReview(featureSeedId)
      const evaluatedReview = evaluateImplementationReadiness({
        ...current,
        ...update,
        featureSeedId,
      })
      const featureSeed = featureSeeds.find(
        (seed) => seed.id === featureSeedId,
      )
      const nextReview = featureSeed
        ? {
            ...evaluatedReview,
            recommendedVerifications: generateRecommendedVerifications({
              featureSeed,
              implementationReview: evaluatedReview,
              projectConfig,
            }),
          }
        : evaluatedReview
      const nextReviews = [
        nextReview,
        ...implementationReviews.filter(
          (review) => review.featureSeedId !== featureSeedId,
        ),
      ]
      setImplementationReviewsState(nextReviews)
      onChange(nextReviews)
      return nextReview
    },
    [featureSeeds, implementationReviews, onChange, projectConfig],
  )

  const getImplementationReview = useCallback(
    (featureSeedId: string): ImplementationReview => {
      const evaluatedReview = evaluateImplementationReadiness(
        implementationReviews.find(
          (review) => review.featureSeedId === featureSeedId,
        ) ?? createImplementationReview(featureSeedId),
      )
      const featureSeed = featureSeeds.find(
        (seed) => seed.id === featureSeedId,
      )
      return featureSeed
        ? {
            ...evaluatedReview,
            recommendedVerifications: generateRecommendedVerifications({
              featureSeed,
              implementationReview: evaluatedReview,
              projectConfig,
            }),
          }
        : evaluatedReview
    },
    [featureSeeds, implementationReviews, projectConfig],
  )

  return {
    implementationReviews,
    setImplementationReviews: setImplementationReviewsState,
    updateImplementationReview,
    getImplementationReview,
  }
}
