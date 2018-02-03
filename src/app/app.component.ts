import { Component, ChangeDetectorRef } from '@angular/core';

/* Name: AppComponent
 * Description: Component for tuner
 * Credit: github.com/googlearchive/guitar-tuner/blob/master/src/elements/audio-processor/audio-processor.js
 */
@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent {
    // Private members
    private analyser;
    private assessedStringsInLastFrame: Boolean;
    private assessStringsUntilTime;
    private audioContext: AudioContext;
    private FFTSIZE;
    private frequencyBuffer;
    private frequencyBufferLength;
    private gainNode;
    private lastRms;
    private microphone;
    private rmsThreshold;
    private sendingAudioData: Boolean;
    private stream;
    private strings: Object;
    private stringsKeys: Array<any>;
    private pieData = [
        {
            name: 'Frequency',
            value: 0
        },
        {
            name: 'Leftover',
            value: 0
        }
    ];

    // Public members
    public colorScheme: Object = {
        domain: ['#5AA454', '#AAAAAA', '#C7B42C', '#AAAAAA']
    };
    public doughnut: Boolean = true;
    public explodeSlices: Boolean = false;
    public freq;
    public frequencyData: Array<Object> = [
        {
            "name": "Leftover",
            "value": 500
        },
        {
            "name": "Frequency",
            "value": 300
        }
    ];
    public note: String;
    public notes: string[] = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
    public showLabels: Boolean = false;
    public showLegend: Boolean = false;
    public tooltipDisabled: Boolean = true;

    /* Name: constructor
     * Description: Constructor for app component
     * Return:
     */
    constructor(
        private changeDetectorRef: ChangeDetectorRef
    ) {
        this.created();
        this.requestUserMedia();
    }

    /* Name: autocorrelateAudioData
     * Description: Calculation for the frequency
     * Return:
     */
    private autocorrelateAudioData (time) {
        let rms = 0;
        let difference = 0;
        let offset = 0;
        let offsetKey = null;
        const searchSize = this.frequencyBufferLength * 0.5;
        const sampleRate = this.audioContext.sampleRate;
        const tolerance = 0.001;
        const rmsMin = 0.008;
        const assessedStringsInLastFrame = this.assessedStringsInLastFrame;

        // Fill up the data.
        this.analyser.getFloatTimeDomainData(this.frequencyBuffer);
        // Figure out the root-mean-square, or rms, of the audio. Basically
        // this seems to be the amount of signal in the buffer.
        for (let d = 0; d < this.frequencyBuffer.length; d++) {
            rms += this.frequencyBuffer[d] * this.frequencyBuffer[d];
        }

        rms = Math.sqrt(rms / this.frequencyBuffer.length);

        // If there's little signal in the buffer quit out.
        if (rms < rmsMin) {
            return 0;
        }


        // Only check for a new string if the volume goes up. Otherwise assume
        // that the string is the same as the last frame.
        if (rms > this.lastRms + this.rmsThreshold) {
            this.assessStringsUntilTime = time + 250;
        }

        if (time < this.assessStringsUntilTime) {
            this.assessedStringsInLastFrame = true;

            // Go through each string and figure out which is the most
            // likely candidate for the string being tuned based on the
            // difference to the "perfect" tuning.
            for (let o = 0; o < this.stringsKeys.length; o++) {

                offsetKey = this.stringsKeys[o];
                offset = this.strings[offsetKey].offset;
                difference = 0;

                // Reset how often this string came out as the closest.
                if (assessedStringsInLastFrame === false) {
                    this.strings[offsetKey].difference = 0;
                }

                // Now we know where the peak is, we can start
                // assessing this sample based on that. We will
                // step through for this string comparing it to a
                // "perfect wave" for this string.
                for (let i = 0; i < searchSize; i++) {
                    difference += Math.abs(this.frequencyBuffer[i] -
                        this.frequencyBuffer[i + offset]);
                }

                difference /= searchSize;

                // Weight the difference by frequency. So lower strings get
                // less preferential treatment (higher offset values). This
                // is because harmonics can mess things up nicely, so we
                // course correct a little bit here.
                this.strings[offsetKey].difference += (difference * offset);
            }
        } else {
            this.assessedStringsInLastFrame = false;
        }
        // If this is the first frame where we've not had to reassess strings
        // then we will order by the string with the largest number of matches.
        if (assessedStringsInLastFrame === true &&
            this.assessedStringsInLastFrame === false) {
            this.stringsKeys.sort(this.sortStringKeysByDifference);
        }
        // Next for the top candidate in the set, figure out what
        // the actual offset is from the intended target.
        // We'll do it by making a full sweep from offset - 10 -> offset + 10
        // and seeing exactly how long it takes for this wave to repeat itself.
        // And that will be our *actual* frequency.
        const searchRange = 10;
        const assumedString = this.strings[this.stringsKeys[0]];
        const searchStart = assumedString.offset - searchRange;
        const searchEnd = assumedString.offset + searchRange;
        let actualFrequency = assumedString.offset;
        let smallestDifference = Number.POSITIVE_INFINITY;

        for (let s = searchStart; s < searchEnd; s++) {
            difference = 0;
            // For each iteration calculate the difference of every element of the
            // array. The data in the buffer should be PCM, so values ranging
            // from -1 to 1. If they match perfectly then they'd essentially
            // cancel out. But this is real data so we'll be looking for small
            // amounts. If it's below tolerance assume a perfect match, otherwise
            // go with the smallest.
            //
            // A better version of this would be to curve match on the data.
            for (let i = 0; i < searchSize; i++) {
                difference += Math.abs(this.frequencyBuffer[i] -
                this.frequencyBuffer[i + s]);
            }
            difference /= searchSize;
            if (difference < smallestDifference) {
                smallestDifference = difference;
                actualFrequency = s;
            }
            if (difference < tolerance) {
                actualFrequency = s;
                break;
            }
        }
        this.lastRms = rms;
        return this.audioContext.sampleRate / actualFrequency;
    }

    /* Name: created
     * Description: Create AudioContext and setup to receive audio
     * Return:
     */
    private created() {

        this.FFTSIZE = 2048;
        this.stream = null;
        this.audioContext = new AudioContext();
        this.analyser = this.audioContext.createAnalyser();
        this.gainNode = this.audioContext.createGain();
        this.microphone = null;

        this.gainNode.gain.value = 0;
        this.analyser.fftSize = this.FFTSIZE;
        this.analyser.smoothingTimeConstant = 0;

        this.frequencyBufferLength = this.FFTSIZE;
        this.frequencyBuffer = new Float32Array(this.frequencyBufferLength);

        this.strings = {
            e2: {
                offset: Math.round(this.audioContext.sampleRate / 82.4069),
                difference: 0
            },

            a2: {
                offset: Math.round(this.audioContext.sampleRate / 110),
                difference: 0
            },

            d3: {
                offset: Math.round(this.audioContext.sampleRate / 146.832),
                difference: 0
            },

            g3: {
                offset: Math.round(this.audioContext.sampleRate / 195.998),
                difference: 0
            },

            b3: {
                offset: Math.round(this.audioContext.sampleRate / 246.932),
                difference: 0
            },

            e4: {
                offset: Math.round(this.audioContext.sampleRate / 329.628),
                difference: 0
            }
        };

        this.stringsKeys = Object.keys(this.strings);

        this.lastRms = 0;
        this.rmsThreshold = 0.006;
        this.assessedStringsInLastFrame = false;
        this.assessStringsUntilTime = 0;

        // Bind as we would have done for anything in the constructor so we can use
        // them without confusing what 'this' means. Yay window scoped.
        this.dispatchAudioData = this.dispatchAudioData.bind(this);
        this.sortStringKeysByDifference = this.sortStringKeysByDifference.bind(this);
        this.onVisibilityChange = this.onVisibilityChange.bind(this);
    }

    /* Name: dispatchAudioData
     * Description: Calculate and update the data
     * Return:
     */
    private dispatchAudioData (time) {
        // Always set up the next pass here, because we could
        // early return from this pass if there's not a lot
        // of exciting data to deal with.
        if (this.sendingAudioData) {
            requestAnimationFrame(this.dispatchAudioData);
        }

        const frequency = this.autocorrelateAudioData(time);

        if (frequency === 0) {
            return;
        }


        // Convert the most active frequency to linear, based on A440.
        const dominantFrequency = Math.log2(frequency / 440);

        // Figure out how many semitones that equates to.
        const semitonesFromA4 = 12 * dominantFrequency;

        // The octave is A440 for 4, so start there, then adjust by the
        // number of semitones. Since we're at A, we need only 3 more to
        // push us up to octave 5, and 9 to drop us to 3. So there's the magic
        // 9 in that line below accounted for.
        let octave = 4 + ((9 + semitonesFromA4) / 12);
        octave = Math.floor(octave);

        // The note is 0 for A, all the way to 11 for G#.
        const note = (12 + (Math.round(semitonesFromA4) % 12)) % 12;
        this.freq = frequency.toFixed(2);
        this.note = this.notes[note];
        this.updateData();
        this.changeDetectorRef.detectChanges();
    }

    /* Name: onVisibilityChange
     * Description: When the document is visible then request media
     * Return:
     */
    private onVisibilityChange () {
        if (document.hidden) {
            this.sendingAudioData = false;
            if (this.stream) {
                // Chrome 47+
                this.stream.getAudioTracks().forEach((track) => {
                    if ('stop' in track) {
                    track.stop();
                    }
                });
                // Chrome 46-
                if ('stop' in this.stream) {
                    this.stream.stop();
                }
            }
            this.stream = null;
        } else {
            this.requestUserMedia();
        }
    }

    /* Name: requestUserMedia
     * Description: Initialize the microphone
     * Return:
     */
    private requestUserMedia () {
        navigator.getUserMedia({audio: true}, (stream) => {
            this.sendingAudioData = true;
            this.stream = stream;
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);
            this.analyser.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
            requestAnimationFrame(this.dispatchAudioData);
        }, (err) => {
            console.log('microphone error');
        });
    }

    /* Name: sortStringKeysByDifference
     * Description: Sort string keys by difference between them
     * Return:
     */
    private sortStringKeysByDifference (a, b) {
        return this.strings[a].difference - this.strings[b].difference;
    }

    /* Name: setPieData
     * Description: Set pieData
     * Return:
     */
    private setPieData(upper, lower, target) {
        if (this.freq >= lower && this.freq <= upper) {
            this.pieData[0].value = this.freq;
            this.pieData[1].value = 0;
        } else if (this.freq > upper) {
            this.pieData[0].value = this.freq - upper;
            this.pieData[1].value = upper - this.pieData[0].value;
        } else {
            this.pieData[0].value = this.freq;
            this.pieData[1].value = upper - this.freq;
        }
    }

    /* Name: updateData
     * Description: Update pie chart data
     * Return:
     */
    private updateData() {
        // 1 (E)	329.63 Hz	E4
        // 2 (B)	246.94 Hz	B3
        // 3 (G)	196.00 Hz	G3
        // 4 (D)	146.83 Hz	D3
        // 5 (A)	110.00 Hz	A2
        // 6 (E)	82.41 Hz	E2
        let target;
        let upper;
        let lower;

        // Low E String
        if (this.freq > 0 && this.freq <= 96.41) {
            target = 82.41;
            upper = 82.82;
            lower = 81.99;
            this.setPieData(upper, lower, target);
        // A String
        } else if (this.freq > 96.41 && this.freq <= 128.41) {
            target = 110.00;
            upper = 110.55;
            lower = 109.45;
            this.setPieData(upper, lower, target);
        // D String
        } else if (this.freq > 128.41 && this.freq <= 171.42) {
            target = 146.83;
            upper = 147.56;
            lower = 146.10;
            this.setPieData(upper, lower, target);
        // G String
        } else if (this.freq > 171.42 && this.freq <= 221.47) {
            target = 196.00;
            upper = 196.96;
            lower = 195.02;
            this.setPieData(upper, lower, target);
        // B String
        } else if (this.freq > 221.47 && this.freq <= 286.79) {
            target = 246.94;
            upper = 248.18;
            lower = 245.71;
            this.setPieData(upper, lower, target);
        // Hi E String
        } else if (this.freq > 286.79) {
            // 288.285 && inFrequency <= 350
            target = 329.63;
            upper = 331.28;
            lower = 327.98;
            this.setPieData(upper, lower, target);
        }
        this.frequencyData = [... this.pieData];
    }
}
