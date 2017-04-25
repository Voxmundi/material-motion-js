/** @license
 *  Copyright 2016 - present The Material Motion Authors. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"); you may not
 *  use this file except in compliance with the License. You may obtain a copy
 *  of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 *  WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 *  License for the specific language governing permissions and limitations
 *  under the License.
 */

import {
  Constructor,
  MotionNextOperable,
  MotionTimestampable,
  MotionWindowable,
  NextChannel,
  Observable,
  ObservableWithMotionOperators,
  Point2D,
  Timestamped,
} from '../types';

import {
  isPoint2D,
} from '../typeGuards';

export interface MotionVelocityMeasurable<T> {
  velocity(pulse?: MotionTimestampable<T> & Observable<any>): ObservableWithMotionOperators<T>;
}

// The velocity algorithm (and the constants it uses) are ported from Google's
// internal drag velocity library.  It has been used successfully on projects
// such as the AMP results carousel in the google.com search results page.

const MAXIMUM_AGE = 250;
const MAXIMUM_INCOMING_DISPATCHES = 5;
const MAXIMUM_VELOCITY = 5;
const DEFAULT_VELOCITY = 1;

export function withVelocity<T, S extends Constructor<MotionNextOperable<T> & MotionTimestampable<T> & MotionWindowable<T>>>(superclass: S): S & Constructor<MotionVelocityMeasurable<T>> {
  return class extends superclass implements MotionVelocityMeasurable<T> {
    /**
     * Computes the velocity of an incoming stream and dispatches the result.
     * Velocity's denominator is in milliseconds; if the incoming stream is
     * measured in pixels, the resulting stream will be in pixels / millisecond.
     *
     * If `pulse` is supplied, `velocity(pulse)` will only dispatch values when
     * `pulse` dispatches a value.  This is useful for ensuring that velocity
     * is only calculated when it will be used.
     */
    velocity(pulse: MotionTimestampable<T> & Observable<any> = this): ObservableWithMotionOperators<T> {
      return this.timestamp().slidingWindow(MAXIMUM_INCOMING_DISPATCHES)._nextOperator<T>(
        (timestampedValues: Array<Timestamped<T>>, dispatch: NextChannel<T>) => {
          pulse.timestamp().subscribe(
            ({ timestamp: now }) => {
              const recentValues = timestampedValues.filter(
                ({ timestamp }) => now - timestamp < MAXIMUM_AGE
              );

              const timestamps = timestampedValues.map(value => value.timestamp);

              if (isPoint2D(timestampedValues[0].value)) {
                dispatch({
                  x: calculateVelocity(
                    recentValues.map(({ value }) => value.x),
                    timestamps
                  ),
                  y: calculateVelocity(
                    recentValues.map(({ value }) => value.y),
                    timestamps
                  ),
                });
              } else {
                dispatch(
                  calculateVelocity(
                    recentValues.map(({ value }) => value),
                    timestamps
                  )
                );
              }
            }
          );
        }
      );
    }
  };
}

/**
 * Computes velocity using the oldest value that's moving in the current
 * direction.
 */
function calculateVelocity(values: Array<number>, timestamps: Array<number>): number {
  const lastIndex = values.length - 1;
  let velocity: number = 0;

  for (let i = lastIndex - 1; i >= 0; i--) {
    const thisVelocity = (values[lastIndex] - values[i]) /
                         (timestamps[lastIndex] - timestamps[i]);

    if (thisVelocity > 0 === velocity > 0 || !velocity) {
      velocity = thisVelocity;
    }
  }

  if (Math.abs(velocity) > MAXIMUM_VELOCITY) {
    // If there isn't enough data to trust our accuracy (perhaps the main thread
    // was blocked), use the default velocity.
    if (values.length < 3) {
      velocity = DEFAULT_VELOCITY;
    } else {
      velocity = MAXIMUM_VELOCITY;
    }
  }

  return velocity;
}